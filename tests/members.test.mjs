import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newSecret, sha256 } from '../server/auth.mjs';
import { grant } from '../server/ledger.mjs';
import {
  checkToken, consumeToken, inviteMember, issueReset, issueSignInLink, previewSignInLink, renewInvitation, updateMember, useSignInLink,
} from '../server/members.mjs';
import {
  PASSWORD, authenticatedClient, client, fixture, joinTeam, readQr, setupOrganization, startServer, tokenFrom,
} from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const clockAt = start => {
  const time = { now: start };
  return Object.assign(() => time.now, { time });
};
const code = expected => error => {
  assert.equal(error.code, expected);
  return true;
};
const HASH = 'scrypt$16384$8$1$00000000000000000000000000000000$' + '0'.repeat(128);

function pendingRedemption(db, userId, rewardName = 'Coffee', costUnits = 300) {
  const rewardId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO rewards (id, name, description, cost_units, active, created_at, updated_at)
              VALUES (?, ?, '', ?, 1, ?, ?)`).run(rewardId, rewardName, costUnits, now, now);
  const id = randomUUID();
  db.prepare(`INSERT INTO redemptions (id, user_id, reward_id, reward_name, cost_units, status, created_at)
              VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(id, userId, rewardId, rewardName, costUnits, now);
  return id;
}

test('last owner cannot be removed', t => {
  const {db,owner} = fixture(t);
  assert.throws(() => updateMember(db,owner,owner.id,{active:false},()=>Date.now()),
    error => error.code === 'LAST_OWNER');
});

test('the last owner cannot be demoted either, but one of two owners can leave', t => {
  const { db, owner, member } = fixture(t);
  assert.throws(() => updateMember(db, owner, owner.id, { role: 'admin' }), code('LAST_OWNER'));
  updateMember(db, owner, member.id, { role: 'owner' });
  const left = updateMember(db, owner, owner.id, { active: false });
  assert.equal(left.status, 'deactivated');
  assert.throws(() => updateMember(db, { id: member.id, role: 'owner' }, member.id, { role: 'member' }), code('LAST_OWNER'));
});

test('admins invite, reset and deactivate members only', t => {
  const { db, owner, member } = fixture(t);
  const promoted = updateMember(db, owner, member.id, { role: 'admin' });
  const admin = { id: promoted.id, role: 'admin' };
  assert.throws(() => inviteMember(db, admin, { username: 'newadmin', displayName: 'New', role: 'admin' }), code('FORBIDDEN'));
  assert.throws(() => inviteMember(db, admin, { username: 'newowner', displayName: 'New', role: 'owner' }), code('FORBIDDEN'));
  const invited = inviteMember(db, admin, { username: 'Casey.Cook', displayName: 'Casey', role: 'member' });
  assert.equal(invited.user.username, 'casey.cook');
  assert.equal(invited.user.status, 'invited');

  assert.throws(() => issueReset(db, admin, owner.id), code('FORBIDDEN'));
  assert.throws(() => updateMember(db, admin, owner.id, { active: false }), code('FORBIDDEN'));
  const otherAdmin = inviteMember(db, owner, { username: 'second.admin', displayName: 'Second', role: 'admin' });
  assert.throws(() => updateMember(db, admin, otherAdmin.user.id, { active: false }), code('FORBIDDEN'));
  assert.throws(() => updateMember(db, admin, invited.user.id, { role: 'admin' }), code('FORBIDDEN'));
  assert.equal(updateMember(db, admin, invited.user.id, { active: false }).status, 'deactivated');
});

test('members cannot use any management function', t => {
  const { db, member, member2 } = fixture(t);
  assert.throws(() => inviteMember(db, member, { username: 'someone', displayName: 'S', role: 'member' }), code('FORBIDDEN'));
  assert.throws(() => issueReset(db, member, member2.id), code('FORBIDDEN'));
  assert.throws(() => updateMember(db, member, member2.id, { active: false }), code('FORBIDDEN'));
  assert.throws(() => updateMember(db, member, member.id, { role: 'owner' }), code('FORBIDDEN'));
  assert.throws(() => issueSignInLink(db, member, member2.id), code('FORBIDDEN'), 'that would be taking over their account');
  assert.throws(() => issueSignInLink(db, member, member.id), code('FORBIDDEN'));
  assert.throws(() => renewInvitation(db, member, member2.id), code('FORBIDDEN'));
});

test('a stale session role does not outlive a demotion', t => {
  const { db, owner, member, member2 } = fixture(t);
  updateMember(db, owner, member.id, { role: 'admin' });
  updateMember(db, owner, member.id, { role: 'member' });
  // The caller still believes it is an admin; the database says otherwise.
  assert.throws(() => inviteMember(db, { id: member.id, role: 'admin' }, { username: 'sneaky', displayName: 'S', role: 'member' }), code('FORBIDDEN'));
  assert.throws(() => issueSignInLink(db, { id: member.id, role: 'admin' }, member2.id), code('FORBIDDEN'));
});

test('member updates accept only role and active', t => {
  const { db, owner, member } = fixture(t);
  assert.throws(() => updateMember(db, owner, member.id, { displayName: 'Renamed' }), code('UNKNOWN_FIELD'));
  assert.throws(() => updateMember(db, owner, member.id, { active: 'false' }), code('INVALID_INPUT'));
  assert.throws(() => updateMember(db, owner, member.id, { role: 'superuser' }), code('INVALID_INPUT'));
  assert.throws(() => updateMember(db, owner, 'not-a-uuid', { active: false }), code('MEMBER_NOT_FOUND'));
  assert.throws(() => updateMember(db, owner, randomUUID(), { active: false }), code('MEMBER_NOT_FOUND'));
  assert.throws(() => inviteMember(db, owner, { username: 'member', displayName: 'Dup', role: 'member' }), code('USERNAME_TAKEN'));
  assert.throws(() => inviteMember(db, owner, { username: 'x', displayName: 'Short', role: 'member' }), code('INVALID_INPUT'));
});

test('invitation tokens are single-use, expire and keep to their purpose', t => {
  const { db, owner } = fixture(t);
  const clock = clockAt(Date.now());
  const first = inviteMember(db, owner, { username: 'river', displayName: 'River', role: 'admin' }, clock);
  assert.throws(() => consumeToken(db, { token: first.token, passwordHash: HASH, purpose: 'reset' }, clock), code('INVALID_TOKEN'));
  consumeToken(db, { token: first.token, passwordHash: HASH, purpose: 'invite' }, clock);
  const joined = db.prepare('SELECT active, password_hash FROM users WHERE id = ?').get(first.user.id);
  assert.deepEqual(joined, { active: 1, password_hash: HASH });
  assert.throws(() => consumeToken(db, { token: first.token, passwordHash: HASH, purpose: 'invite' }, clock), code('INVALID_TOKEN'));

  const late = inviteMember(db, owner, { username: 'late.one', displayName: 'Late', role: 'admin' }, clock);
  clock.time.now += 7 * DAY + 1;
  assert.throws(() => consumeToken(db, { token: late.token, passwordHash: HASH, purpose: 'invite' }, clock), code('INVALID_TOKEN'));
  const renewed = renewInvitation(db, owner, late.user.id, clock);
  consumeToken(db, { token: renewed.token, passwordHash: HASH, purpose: 'invite' }, clock);
  assert.throws(() => renewInvitation(db, owner, late.user.id, clock), code('NOT_INVITED'));
  assert.throws(() => consumeToken(db, { token: 'not a token', passwordHash: HASH, purpose: 'invite' }, clock), code('INVALID_TOKEN'));
});

test('a new reset link replaces the old one and expires in 30 minutes', t => {
  const { db, owner, member } = fixture(t);
  const clock = clockAt(Date.now());
  updateMember(db, owner, member.id, { role: 'admin' }, clock);
  const old = issueReset(db, owner, member.id, clock);
  const fresh = issueReset(db, owner, member.id, clock);
  assert.throws(() => consumeToken(db, { token: old.token, passwordHash: HASH, purpose: 'reset' }, clock), code('INVALID_TOKEN'));
  clock.time.now += 30 * 60 * 1000;
  assert.throws(() => consumeToken(db, { token: fresh.token, passwordHash: HASH, purpose: 'reset' }, clock), code('INVALID_TOKEN'));
  const again = issueReset(db, owner, member.id, clock);
  consumeToken(db, { token: again.token, passwordHash: HASH, purpose: 'reset' }, clock);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(member.id).password_hash, HASH);
});

test('reset links are not for people who have not joined or were deactivated', t => {
  const { db, owner, member } = fixture(t);
  updateMember(db, owner, member.id, { role: 'admin' });
  const invited = inviteMember(db, owner, { username: 'not.yet', displayName: 'Not yet', role: 'admin' });
  assert.throws(() => issueReset(db, owner, invited.user.id), code('INVITATION_PENDING'));
  const pending = issueReset(db, owner, member.id);
  updateMember(db, owner, member.id, { active: false });
  assert.throws(() => consumeToken(db, { token: pending.token, passwordHash: HASH, purpose: 'reset' }), code('INVALID_TOKEN'));
  assert.throws(() => issueReset(db, owner, member.id), code('MEMBER_INACTIVE'));
  assert.equal(db.prepare('SELECT active FROM users WHERE id = ?').get(member.id).active, 0);
});

test('deactivation ends sessions and links, cancels pending requests and keeps history', t => {
  const { db, owner, member } = fixture(t);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO sessions (token_hash, user_id, csrf_hash, created_at, expires_at) VALUES ('s1', ?, 'c', ?, '2099-01-01T00:00:00.000Z')`).run(member.id, now);
  const grantId = randomUUID();
  db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at)
              VALUES (?, ?, 5000, 'grant', ?, 'Thanks', NULL, 'history-grant-0001', ?)`).run(grantId, member.id, owner.id, now);
  const first = pendingRedemption(db, member.id, 'Coffee');
  const second = pendingRedemption(db, member.id, 'Lunch');
  const link = issueSignInLink(db, owner, member.id);

  const result = updateMember(db, owner, member.id, { active: false });
  assert.equal(result.status, 'deactivated');
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(member.id).n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM tokens WHERE user_id = ? AND used_at IS NULL').get(member.id).n, 0);
  for (const id of [first, second]) {
    const row = db.prepare('SELECT status, resolved_by, resolved_at FROM redemptions WHERE id = ?').get(id);
    assert.equal(row.status, 'cancelled');
    assert.equal(row.resolved_by, owner.id);
    assert.ok(row.resolved_at);
  }
  const cancels = db.prepare(`SELECT count(*) AS n FROM audit WHERE action = 'redemption.cancel' AND actor_id = ?`).get(owner.id).n;
  assert.equal(cancels, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM ledger WHERE user_id = ?').get(member.id).n, 1);
  assert.throws(() => useSignInLink(db, { token: link.token }), code('INVALID_TOKEN'));

  const back = updateMember(db, owner, member.id, { active: true });
  assert.equal(back.status, 'active');
  const invited = inviteMember(db, owner, { username: 'withdrawn', displayName: 'Withdrawn', role: 'member' });
  updateMember(db, owner, invited.user.id, { active: false });
  assert.equal(updateMember(db, owner, invited.user.id, { active: true }).status, 'invited');
});

test('an admin invitation is accepted over HTTP, once, and then needs a normal sign-in', async t => {
  const { server, api: owner } = await authenticatedClient(t);
  const invite = await owner.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam', role: 'admin' });
  assert.equal(invite.status, 201);
  const url = new URL(invite.body.invitationUrl);
  assert.equal(url.origin, server.base);
  assert.equal(url.search, '');
  assert.match(url.hash, /^#invite=[A-Za-z0-9_-]{43}$/);
  const token = url.hash.slice('#invite='.length);

  // Opening the link is a GET for the page; the token stays in the fragment and is not used up.
  await fetch(invite.body.invitationUrl);
  const visitor = client(server.base);
  await visitor.bootstrap();
  const weak = await visitor.request('POST', '/api/invitations/accept', { token, password: 'short' });
  assert.equal(weak.status, 422);
  const accepted = await visitor.request('POST', '/api/invitations/accept', { token, password: PASSWORD });
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body, { username: 'sam' });
  assert.equal((await visitor.request('GET', '/api/session')).body.user, null);
  const reused = await visitor.request('POST', '/api/invitations/accept', { token, password: PASSWORD });
  assert.equal(reused.status, 400);
  assert.equal(reused.body.error.code, 'INVALID_TOKEN');
  assert.equal((await visitor.request('POST', '/api/login', { username: 'sam', password: PASSWORD })).status, 200);
});

test('two simultaneous uses of one sign-in link: exactly one phone gets in', async t => {
  const { server, api: owner } = await authenticatedClient(t);
  const invite = await owner.request('POST', '/api/admin/invitations', { username: 'twin.m', displayName: 'Twin', role: 'member' });
  const token = tokenFrom(invite.body.signinUrl, 'signin');
  const a = client(server.base);
  const b = client(server.base);
  await Promise.all([a.bootstrap(), b.bootstrap()]);
  const results = await Promise.all([
    a.request('POST', '/api/signin/accept', { token }),
    b.request('POST', '/api/signin/accept', { token }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(invite.body.user.id).n, 1);
});

test('two simultaneous accepts of one invitation: exactly one wins', async t => {
  const { server, api: owner } = await authenticatedClient(t);
  const invite = await owner.request('POST', '/api/admin/invitations', { username: 'twin', displayName: 'Twin', role: 'admin' });
  const token = new URL(invite.body.invitationUrl).hash.slice('#invite='.length);
  const a = client(server.base);
  const b = client(server.base);
  await Promise.all([a.bootstrap(), b.bootstrap()]);
  const results = await Promise.all([
    a.request('POST', '/api/invitations/accept', { token, password: PASSWORD }),
    b.request('POST', '/api/invitations/accept', { token, password: `${PASSWORD} two` }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});

test('a password reset signs the person out everywhere', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const { api: member, user } = await joinTeam(server, owner, { username: 'mina', role: 'admin' });
  assert.equal((await member.request('GET', '/api/session')).body.user.username, 'mina');

  const reset = await owner.request('POST', `/api/admin/members/${user.id}/reset`);
  assert.equal(reset.status, 200);
  assert.match(new URL(reset.body.resetUrl).hash, /^#reset=[A-Za-z0-9_-]{43}$/);
  // Issuing the link alone does not sign anyone out.
  assert.equal((await member.request('GET', '/api/session')).body.user.username, 'mina');

  const visitor = client(server.base);
  await visitor.bootstrap();
  const token = new URL(reset.body.resetUrl).hash.slice('#reset='.length);
  const newPassword = 'a brand new passphrase';
  assert.equal((await visitor.request('POST', '/api/password/reset', { token, password: newPassword })).status, 200);
  assert.equal((await member.request('GET', '/api/session')).body.user, null);
  assert.equal((await visitor.request('POST', '/api/login', { username: 'mina', password: PASSWORD })).status, 401);
  assert.equal((await visitor.request('POST', '/api/login', { username: 'mina', password: newPassword })).status, 200);
});

test('deactivating over HTTP signs the person out and voids their invitation', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const { api: member, user } = await joinTeam(server, owner, { username: 'leaving' });
  const invite = await owner.request('POST', '/api/admin/invitations', { username: 'never', displayName: 'Never', role: 'member' });

  const off = await owner.request('PATCH', `/api/admin/members/${user.id}`, { active: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.status, 'deactivated');
  assert.equal((await member.request('GET', '/api/session')).body.user, null);

  const withdraw = await owner.request('PATCH', `/api/admin/members/${invite.body.user.id}`, { active: false });
  assert.equal(withdraw.body.status, 'deactivated');
  const visitor = client(server.base);
  await visitor.bootstrap();
  const token = tokenFrom(invite.body.signinUrl, 'signin');
  assert.equal((await visitor.request('POST', '/api/signin/accept', { token })).status, 400);
});

test('roles are enforced by the server, not by hidden buttons', async t => {
  const server = await startServer(t);
  const { api: owner, user: ownerUser } = await setupOrganization(server);
  const { api: admin } = await joinTeam(server, owner, { username: 'ada', role: 'admin' });
  const { api: member, user: memberUser } = await joinTeam(server, owner, { username: 'max' });
  const { user: otherUser } = await joinTeam(server, owner, { username: 'moe.m' });
  // The code, not just the status: a request refused for having no session is a 403 too.
  const forbidden = async (pending, what) => {
    const response = await pending;
    assert.equal(response.status, 403, what);
    assert.equal(response.body.error.code, 'FORBIDDEN', what);
  };

  // A team member who is still signed in is refused every management call, above all a
  // sign-in link for someone else: that would be taking over their account.
  await forbidden(member.request('POST', `/api/admin/members/${otherUser.id}/signin-link`), 'a sign-in link for another member');
  await forbidden(member.request('POST', `/api/admin/members/${memberUser.id}/signin-link`), 'a sign-in link for themselves');
  await forbidden(member.request('POST', '/api/admin/invitations', { username: 'y.member', displayName: 'Y', role: 'member' }), 'an invitation');
  await forbidden(member.request('PATCH', `/api/admin/members/${otherUser.id}`, { active: false }), 'a deactivation');
  await forbidden(member.request('PATCH', `/api/admin/members/${memberUser.id}`, { role: 'owner' }), 'a role change');
  await forbidden(member.request('POST', `/api/admin/members/${ownerUser.id}/reset`), 'a reset link');
  assert.equal((await member.request('GET', '/api/me')).status, 200, 'still signed in: every refusal was about the role');

  await forbidden(admin.request('POST', `/api/admin/members/${ownerUser.id}/reset`), 'an admin resetting an owner');
  await forbidden(admin.request('PATCH', `/api/admin/members/${ownerUser.id}`, { active: false }), 'an admin deactivating an owner');
  await forbidden(admin.request('POST', '/api/admin/invitations', { username: 'x.admin', displayName: 'X', role: 'admin' }), 'an admin inviting an admin');
  await forbidden(admin.request('PATCH', `/api/admin/members/${memberUser.id}`, { role: 'admin' }), 'an admin changing a role');
  assert.equal((await admin.request('POST', `/api/admin/members/${otherUser.id}/signin-link`)).status, 200);

  const signedOut = client(server.base);
  await signedOut.bootstrap();
  assert.equal((await signedOut.request('POST', '/api/admin/invitations', { username: 'z.member', displayName: 'Z', role: 'member' })).status, 401);
  assert.equal((await signedOut.request('POST', `/api/admin/members/${otherUser.id}/signin-link`)).status, 401);
});

test('a sign-in link replaces the session the browser had instead of upgrading it', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const first = await owner.request('POST', '/api/admin/invitations', { username: 'mina.p', displayName: 'Mina', role: 'member' });
  const second = await owner.request('POST', '/api/admin/invitations', { username: 'moe.m', displayName: 'Moe', role: 'member' });
  const rowsFor = cookie => server.db.prepare('SELECT count(*) AS n FROM sessions WHERE token_hash = ?').get(sha256(cookie)).n;
  const holding = (name, { cookie, csrf }) => {
    const other = client(server.base);
    other.cookies.set(name, cookie);
    other.csrf = csrf;
    return other;
  };

  // A fresh phone: its anonymous session is gone, not turned into Mina's.
  const phone = client(server.base);
  await phone.bootstrap();
  const [name] = phone.cookies.keys();
  const anonymous = { cookie: phone.cookies.get(name), csrf: phone.csrf };
  const signedIn = await phone.request('POST', '/api/signin/accept', { token: tokenFrom(first.body.signinUrl, 'signin') });
  assert.equal(signedIn.status, 200);
  assert.notEqual(phone.cookies.get(name), anonymous.cookie);
  assert.notEqual(signedIn.body.csrfToken, anonymous.csrf);
  assert.equal(rowsFor(anonymous.cookie), 0);
  assert.equal((await holding(name, anonymous).request('GET', '/api/session')).body.user, null, 'the old cookie did not become Mina');

  // The owner's own laptop: the owner is signed out there, and their old cookie is dead.
  const before = { cookie: owner.cookies.get(name), csrf: owner.csrf };
  const taken = await owner.request('POST', '/api/signin/accept', { token: tokenFrom(second.body.signinUrl, 'signin') });
  assert.equal(taken.body.user.username, 'moe.m');
  assert.equal(rowsFor(before.cookie), 0);
  assert.equal((await holding(name, before).request('GET', '/api/admin/members')).status, 401);
  assert.equal((await owner.request('GET', '/api/admin/members')).body.error.code, 'FORBIDDEN', 'this browser is Moe now, a team member');
});

test('a link stops working when the account it is for changes role', t => {
  const { db, owner, member, member2 } = fixture(t);
  updateMember(db, owner, member.id, { role: 'admin' });
  const admin = { id: member.id, role: 'admin' };
  // The takeover the review found: an admin invites a team member, the owner promotes the
  // pending account, and the admin uses the link they still hold.
  const invited = inviteMember(db, admin, { username: 'bob.b', displayName: 'Bob', role: 'member' });
  updateMember(db, owner, invited.user.id, { role: 'owner' });
  assert.throws(() => useSignInLink(db, { token: invited.token }), code('INVALID_TOKEN'));
  assert.equal(db.prepare('SELECT active FROM users WHERE id = ?').get(invited.user.id).active, 0);
  // An owner joins with a password, through an invitation from someone who may make owners.
  const renewed = renewInvitation(db, owner, invited.user.id);
  consumeToken(db, { token: renewed.token, passwordHash: HASH, purpose: 'invite' });

  const link = issueSignInLink(db, admin, member2.id);
  updateMember(db, owner, member2.id, { role: 'admin' });
  assert.throws(() => useSignInLink(db, { token: link.token }), code('INVALID_TOKEN'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(member2.id).n, 0);
});

test('a link stops working when whoever made it can no longer manage the account', t => {
  const { db, owner, member, member2 } = fixture(t);
  updateMember(db, owner, member.id, { role: 'admin' });
  const admin = { id: member.id, role: 'admin' };
  const carol = inviteMember(db, admin, { username: 'carol', displayName: 'Carol', role: 'member' });
  const link = issueSignInLink(db, admin, member2.id);
  const ownerMade = inviteMember(db, owner, { username: 'dave', displayName: 'Dave', role: 'member' });

  updateMember(db, owner, member.id, { role: 'member' });
  assert.throws(() => useSignInLink(db, { token: link.token }), code('INVALID_TOKEN'));
  updateMember(db, owner, member.id, { active: false });
  assert.throws(() => useSignInLink(db, { token: carol.token }), code('INVALID_TOKEN'));
  // Links from someone who can still manage the account keep working.
  useSignInLink(db, { token: ownerMade.token });
});

test('links from someone who lost the right to make them are void for good, and refused before any work', t => {
  const { db, owner, member, member2 } = fixture(t);
  updateMember(db, owner, member.id, { role: 'admin' });
  const admin = { id: member.id, role: 'admin' };
  const carol = inviteMember(db, admin, { username: 'carol', displayName: 'Carol', role: 'member' });
  const dan = inviteMember(db, admin, { username: 'dan', displayName: 'Dan', role: 'member' });

  updateMember(db, owner, member.id, { role: 'member' });
  // The cheap check the routes run before doing anything already says no…
  assert.equal(checkToken(db, { token: carol.token, purpose: 'signin' }), false);
  assert.throws(() => previewSignInLink(db, { token: carol.token }), code('INVALID_TOKEN'));
  // …and bringing the admin back does not bring the links back.
  updateMember(db, owner, member.id, { role: 'admin' });
  assert.equal(checkToken(db, { token: carol.token, purpose: 'signin' }), false);
  assert.throws(() => useSignInLink(db, { token: carol.token }), code('INVALID_TOKEN'));
  updateMember(db, owner, member.id, { active: false });
  updateMember(db, owner, member.id, { active: true });
  assert.throws(() => useSignInLink(db, { token: dan.token }), code('INVALID_TOKEN'));

  // The same for a password invitation, which is checked before a password is hashed.
  updateMember(db, owner, member2.id, { role: 'owner' });
  const secondOwner = { id: member2.id, role: 'owner' };
  const ada = inviteMember(db, secondOwner, { username: 'ada', displayName: 'Ada', role: 'admin' });
  updateMember(db, owner, member2.id, { role: 'admin' });
  assert.equal(checkToken(db, { token: ada.token, purpose: 'invite' }), false);
  updateMember(db, owner, member2.id, { role: 'owner' });
  assert.equal(checkToken(db, { token: ada.token, purpose: 'invite' }), false);
  assert.throws(() => consumeToken(db, { token: ada.token, passwordHash: HASH, purpose: 'invite' }), code('INVALID_TOKEN'));
});

test('a demotion voids only the links the person could no longer make', t => {
  const { db, owner, member } = fixture(t);
  updateMember(db, owner, member.id, { role: 'owner' });
  const secondOwner = { id: member.id, role: 'owner' };
  const forAdmin = inviteMember(db, secondOwner, { username: 'ada', displayName: 'Ada', role: 'admin' });
  const forMember = inviteMember(db, secondOwner, { username: 'moe.m', displayName: 'Moe', role: 'member' });
  updateMember(db, owner, member.id, { role: 'admin' });
  // An admin may still invite team members, so that link stands; an admin invitation does not.
  assert.equal(checkToken(db, { token: forMember.token, purpose: 'signin' }), true);
  assert.equal(checkToken(db, { token: forAdmin.token, purpose: 'invite' }), false);
  useSignInLink(db, { token: forMember.token });
});

test('over HTTP, an admin cannot turn an invitation into an owner account', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const { api: admin } = await joinTeam(server, owner, { username: 'ada', role: 'admin' });
  const invite = await admin.request('POST', '/api/admin/invitations', { username: 'bob.b', displayName: 'Bob', role: 'member' });
  assert.equal((await owner.request('PATCH', `/api/admin/members/${invite.body.user.id}`, { role: 'owner' })).status, 200);
  const stranger = client(server.base);
  await stranger.bootstrap();
  const accepted = await stranger.request('POST', '/api/signin/accept', { token: tokenFrom(invite.body.signinUrl, 'signin') });
  assert.equal(accepted.status, 400);
  assert.equal(accepted.body.error.code, 'INVALID_TOKEN');
  assert.equal(server.db.prepare('SELECT active FROM users WHERE id = ?').get(invite.body.user.id).active, 0);
});

test('names and messages refuse text-direction controls but keep right-to-left text and emoji', t => {
  const { db, owner, member } = fixture(t);
  for (const displayName of ['Mina\u202Egnp.exe', 'Mo\u2066', '\u202Aboss\u202C', 'a\u2069b'])
    assert.throws(() => inviteMember(db, owner, { username: `spoof${randomUUID().slice(0, 8)}`, displayName, role: 'member' }),
      code('INVALID_INPUT'), JSON.stringify(displayName));
  assert.throws(() => grant(db, owner, { userId: member.id, units: 10, reason: 'Thanks \u202Eroirepus', key: 'bidi-reason-key-0001' }),
    code('INVALID_INPUT'));
  for (const displayName of ['مينا', 'נועה\u200F', 'Mina 👩\u200D💻'])
    assert.equal(inviteMember(db, owner, { username: `ok${randomUUID().slice(0, 8)}`, displayName, role: 'member' }).user.displayName,
      displayName);
});

/* ---------------------------------------------------------------- personal sign-in links for team members */

const sessionsOf = (db, userId) => db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(userId).n;

test('a team member joins with a personal link and no password', t => {
  const { db, owner } = fixture(t);
  const invited = inviteMember(db, owner, { username: 'mina.p', displayName: 'Mina', role: 'member' });
  assert.equal(invited.purpose, 'signin');
  assert.equal(invited.user.status, 'invited');
  assert.deepEqual(previewSignInLink(db, { token: invited.token }), { displayName: 'Mina' });
  const { user, session } = useSignInLink(db, { token: invited.token });
  assert.equal(user.status, 'active');
  assert.ok(session.token && session.csrfToken);
  assert.equal(sessionsOf(db, invited.user.id), 1);
  const row = db.prepare('SELECT password_hash, joined_at FROM users WHERE id = ?').get(invited.user.id);
  assert.equal(row.password_hash, null, 'a team member never has a password');
  assert.ok(row.joined_at);
  assert.throws(() => useSignInLink(db, { token: invited.token }), code('INVALID_TOKEN'), 'a link works once');
  assert.throws(() => previewSignInLink(db, { token: invited.token }), code('INVALID_TOKEN'));
});

test('owners and admins set a password; team members only ever get sign-in links', t => {
  const { db, owner, member } = fixture(t);
  const admin = inviteMember(db, owner, { username: 'ada', displayName: 'Ada', role: 'admin' });
  assert.equal(admin.purpose, 'invite');
  assert.throws(() => useSignInLink(db, { token: admin.token }), code('INVALID_TOKEN'));
  assert.throws(() => issueSignInLink(db, owner, admin.user.id), code('USE_PASSWORD'));
  const pending = inviteMember(db, owner, { username: 'moe.m', displayName: 'Moe', role: 'member' });
  assert.throws(() => renewInvitation(db, owner, pending.user.id), code('USE_SIGNIN_LINK'));
  assert.throws(() => issueReset(db, owner, member.id), code('USE_SIGNIN_LINK'));
});

test('a new sign-in link replaces the old one and signs the old phone out at once', t => {
  const { db, owner } = fixture(t);
  const invited = inviteMember(db, owner, { username: 'mina.p', displayName: 'Mina', role: 'member' });
  useSignInLink(db, { token: invited.token });
  const older = issueSignInLink(db, owner, invited.user.id);
  const newer = issueSignInLink(db, owner, invited.user.id);
  assert.equal(sessionsOf(db, invited.user.id), 0, 'a lost phone stops working as soon as a new link is made');
  assert.throws(() => useSignInLink(db, { token: older.token }), code('INVALID_TOKEN'));
  useSignInLink(db, { token: newer.token });
  assert.equal(sessionsOf(db, invited.user.id), 1);
});

test('a sign-in link lasts seven days and never brings back someone who was deactivated', t => {
  const { db, owner } = fixture(t);
  const clock = clockAt(Date.parse('2026-09-01T09:00:00Z'));
  const invited = inviteMember(db, owner, { username: 'mina.p', displayName: 'Mina', role: 'member' }, clock);
  clock.time.now += 7 * DAY;
  assert.throws(() => useSignInLink(db, { token: invited.token }, clock), code('INVALID_TOKEN'));
  const fresh = issueSignInLink(db, owner, invited.user.id, clock);
  useSignInLink(db, { token: fresh.token }, clock);
  const unused = issueSignInLink(db, owner, invited.user.id, clock);
  updateMember(db, owner, invited.user.id, { active: false }, clock);
  assert.throws(() => useSignInLink(db, { token: unused.token }, clock), code('INVALID_TOKEN'));
  assert.throws(() => issueSignInLink(db, owner, invited.user.id, clock), code('MEMBER_INACTIVE'));
  // Someone who had joined comes back as active and needs a new link to get in.
  assert.equal(updateMember(db, owner, invited.user.id, { active: true }, clock).status, 'active');
  assert.equal(sessionsOf(db, invited.user.id), 0);
  useSignInLink(db, { token: issueSignInLink(db, owner, invited.user.id, clock).token }, clock);
});

test('every use of a sign-in link is in the activity log, as the member', t => {
  const { db, owner } = fixture(t);
  const invited = inviteMember(db, owner, { username: 'mina.p', displayName: 'Mina', role: 'member' });
  useSignInLink(db, { token: invited.token });
  useSignInLink(db, { token: issueSignInLink(db, owner, invited.user.id).token });
  const rows = db.prepare('SELECT action, actor_id FROM audit WHERE target_id = ? ORDER BY rowid').all(invited.user.id);
  assert.deepEqual(rows.map(row => row.action), ['member.invite', 'member.joined', 'member.signin_link', 'member.signin'],
    'after a lost phone, an admin can see when the new link was used');
  assert.equal(rows.at(-1).actor_id, invited.user.id);
});

test('a sign-in link never signs in an owner or an admin, whoever made it', t => {
  const { db, owner } = fixture(t);
  const admin = inviteMember(db, owner, { username: 'ada', displayName: 'Ada', role: 'admin' });
  // Planted directly, since making one is refused: this tests the check made when a link is used.
  const now = Date.now();
  for (const userId of [admin.user.id, owner.id]) {
    const raw = newSecret();
    db.prepare(`INSERT INTO tokens (token_hash, purpose, user_id, issued_by, created_at, expires_at) VALUES (?, 'signin', ?, ?, ?, ?)`)
      .run(sha256(raw), userId, owner.id, new Date(now).toISOString(), new Date(now + DAY).toISOString());
    assert.throws(() => previewSignInLink(db, { token: raw }), code('INVALID_TOKEN'));
    assert.throws(() => useSignInLink(db, { token: raw }), code('INVALID_TOKEN'));
  }
});

test('a role change signs the person out; a new admin sets a password, a demoted admin loses theirs', t => {
  const { db, owner } = fixture(t);
  const invited = inviteMember(db, owner, { username: 'mina.p', displayName: 'Mina', role: 'member' });
  useSignInLink(db, { token: invited.token });
  updateMember(db, owner, invited.user.id, { role: 'admin' });
  assert.equal(sessionsOf(db, invited.user.id), 0, 'a phone signed in as a team member does not become an admin');
  const reset = issueReset(db, owner, invited.user.id);
  consumeToken(db, { token: reset.token, passwordHash: HASH, purpose: 'reset' });
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(invited.user.id).password_hash, HASH);
  db.prepare(`INSERT INTO sessions (token_hash, user_id, csrf_hash, created_at, expires_at)
              VALUES ('admin-session', ?, 'x', ?, '2099-01-01T00:00:00.000Z')`).run(invited.user.id, new Date().toISOString());
  updateMember(db, owner, invited.user.id, { role: 'member' });
  assert.equal(sessionsOf(db, invited.user.id), 0);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(invited.user.id).password_hash, null);
});

test('over HTTP, a team member signs in with their link and stays signed in; a password gets them nowhere', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const invite = await owner.request('POST', '/api/admin/invitations', { username: 'mina.p', displayName: 'Mina', role: 'member' });
  assert.equal(invite.status, 201);
  assert.equal(invite.body.invitationUrl, undefined, 'no password invitation for a team member');
  const token = tokenFrom(invite.body.signinUrl, 'signin');
  const phone = client(server.base);
  await phone.bootstrap();
  assert.deepEqual((await phone.request('POST', '/api/signin/preview', { token })).body, { displayName: 'Mina' });
  const signedIn = await phone.request('POST', '/api/signin/accept', { token });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.user.username, 'mina.p');
  assert.match(signedIn.headers.get('set-cookie'), /Max-Age=15552000/);
  phone.csrf = signedIn.body.csrfToken;
  server.time.now += 100 * DAY;
  assert.equal((await phone.request('GET', '/api/me')).status, 200, 'still signed in months later');
  assert.equal((await phone.request('POST', '/api/signin/accept', { token })).status, 400, 'the link worked once');
  const stranger = client(server.base);
  await stranger.bootstrap();
  assert.equal((await stranger.request('POST', '/api/login', { username: 'mina.p', password: PASSWORD })).status, 401);
});

test('over HTTP, admins make sign-in links for team members and password links for owners and admins', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const { user: mina } = await joinTeam(server, owner, { username: 'mina.p', role: 'member' });
  const { user: ada } = await joinTeam(server, owner, { username: 'ada.a', role: 'admin' });
  const link = await owner.request('POST', `/api/admin/members/${mina.id}/signin-link`);
  assert.equal(link.status, 200);
  assert.match(link.body.signinUrl, /#signin=[A-Za-z0-9_-]{43}$/);
  // Whether they had joined, as it is now: the admin's list may be older than that.
  assert.equal(link.body.user.status, 'active');
  const pending = await owner.request('POST', '/api/admin/invitations', { username: 'moe.m', displayName: 'Moe', role: 'member' });
  assert.equal((await owner.request('POST', `/api/admin/members/${pending.body.user.id}/signin-link`)).body.user.status, 'invited');
  assert.equal((await owner.request('POST', `/api/admin/members/${ada.id}/signin-link`)).body.error.code, 'USE_PASSWORD');
  assert.equal((await owner.request('POST', `/api/admin/members/${mina.id}/reset`)).body.error.code, 'USE_SIGNIN_LINK');
  const visitor = client(server.base);
  await visitor.bootstrap();
  assert.equal((await visitor.request('POST', `/api/admin/members/${mina.id}/signin-link`)).status, 401);
});

test('every link an admin makes comes with a QR code that reads back as that link', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const member = await owner.request('POST', '/api/admin/invitations', { username: 'mina.p', displayName: 'Mina', role: 'member' });
  assert.equal(await readQr(member.body.qr), member.body.signinUrl);
  const again = await owner.request('POST', `/api/admin/members/${member.body.user.id}/signin-link`);
  assert.equal(await readQr(again.body.qr), again.body.signinUrl);
  const admin = await owner.request('POST', '/api/admin/invitations', { username: 'ada.a', displayName: 'Ada', role: 'admin' });
  assert.equal(await readQr(admin.body.qr), admin.body.invitationUrl);
  const renewed = await owner.request('POST', `/api/admin/members/${admin.body.user.id}/invitation`);
  assert.equal(await readQr(renewed.body.qr), renewed.body.invitationUrl);
  const { user: joined } = await joinTeam(server, owner, { username: 'amy.a', role: 'admin' });
  const reset = await owner.request('POST', `/api/admin/members/${joined.id}/reset`);
  assert.equal(await readQr(reset.body.qr), reset.body.resetUrl);
});
