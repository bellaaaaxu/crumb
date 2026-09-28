import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { consumeToken, inviteMember, issueReset, renewInvitation, updateMember } from '../server/members.mjs';
import {
  PASSWORD, authenticatedClient, client, fixture, joinTeam, setupOrganization, startServer,
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
});

test('a stale session role does not outlive a demotion', t => {
  const { db, owner, member } = fixture(t);
  updateMember(db, owner, member.id, { role: 'admin' });
  updateMember(db, owner, member.id, { role: 'member' });
  // The caller still believes it is an admin; the database says otherwise.
  assert.throws(() => inviteMember(db, { id: member.id, role: 'admin' }, { username: 'sneaky', displayName: 'S', role: 'member' }), code('FORBIDDEN'));
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
  const first = inviteMember(db, owner, { username: 'river', displayName: 'River', role: 'member' }, clock);
  assert.throws(() => consumeToken(db, { token: first.token, passwordHash: HASH, purpose: 'reset' }, clock), code('INVALID_TOKEN'));
  consumeToken(db, { token: first.token, passwordHash: HASH, purpose: 'invite' }, clock);
  const joined = db.prepare('SELECT active, password_hash FROM users WHERE id = ?').get(first.user.id);
  assert.deepEqual(joined, { active: 1, password_hash: HASH });
  assert.throws(() => consumeToken(db, { token: first.token, passwordHash: HASH, purpose: 'invite' }, clock), code('INVALID_TOKEN'));

  const late = inviteMember(db, owner, { username: 'late.one', displayName: 'Late', role: 'member' }, clock);
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
  const invited = inviteMember(db, owner, { username: 'not.yet', displayName: 'Not yet', role: 'member' });
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
  const reset = issueReset(db, owner, member.id);

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
  assert.throws(() => consumeToken(db, { token: reset.token, passwordHash: HASH, purpose: 'reset' }), code('INVALID_TOKEN'));

  const back = updateMember(db, owner, member.id, { active: true });
  assert.equal(back.status, 'active');
  const invited = inviteMember(db, owner, { username: 'withdrawn', displayName: 'Withdrawn', role: 'member' });
  updateMember(db, owner, invited.user.id, { active: false });
  assert.equal(updateMember(db, owner, invited.user.id, { active: true }).status, 'invited');
});

test('an invitation is accepted over HTTP, once, and then needs a normal sign-in', async t => {
  const { server, api: owner } = await authenticatedClient(t);
  const invite = await owner.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam', role: 'member' });
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

test('two simultaneous accepts of one invitation: exactly one wins', async t => {
  const { server, api: owner } = await authenticatedClient(t);
  const invite = await owner.request('POST', '/api/admin/invitations', { username: 'twin', displayName: 'Twin', role: 'member' });
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
  const { api: member, user } = await joinTeam(server, owner, { username: 'mina' });
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
  await member.bootstrap();
  assert.equal((await member.request('POST', '/api/login', { username: 'leaving', password: PASSWORD })).status, 401);

  const withdraw = await owner.request('PATCH', `/api/admin/members/${invite.body.user.id}`, { active: false });
  assert.equal(withdraw.body.status, 'deactivated');
  const visitor = client(server.base);
  await visitor.bootstrap();
  const token = new URL(invite.body.invitationUrl).hash.slice('#invite='.length);
  assert.equal((await visitor.request('POST', '/api/invitations/accept', { token, password: PASSWORD })).status, 400);
});

test('roles are enforced by the server, not by hidden buttons', async t => {
  const server = await startServer(t);
  const { api: owner, user: ownerUser } = await setupOrganization(server);
  const { api: admin } = await joinTeam(server, owner, { username: 'ada', role: 'admin' });
  const { api: member, user: memberUser } = await joinTeam(server, owner, { username: 'max' });

  assert.equal((await admin.request('POST', `/api/admin/members/${ownerUser.id}/reset`)).status, 403);
  assert.equal((await admin.request('PATCH', `/api/admin/members/${ownerUser.id}`, { active: false })).status, 403);
  assert.equal((await admin.request('POST', '/api/admin/invitations', { username: 'x.admin', displayName: 'X', role: 'admin' })).status, 403);
  assert.equal((await admin.request('PATCH', `/api/admin/members/${memberUser.id}`, { role: 'admin' })).status, 403);
  assert.equal((await admin.request('POST', `/api/admin/members/${memberUser.id}/reset`)).status, 200);

  assert.equal((await member.request('POST', '/api/admin/invitations', { username: 'y.member', displayName: 'Y', role: 'member' })).status, 403);
  assert.equal((await member.request('PATCH', `/api/admin/members/${memberUser.id}`, { role: 'owner' })).status, 403);
  const signedOut = client(server.base);
  await signedOut.bootstrap();
  assert.equal((await signedOut.request('POST', '/api/admin/invitations', { username: 'z.member', displayName: 'Z', role: 'member' })).status, 401);
});

test('a link stops working when the account it is for changes role', t => {
  const { db, owner, member, member2 } = fixture(t);
  updateMember(db, owner, member.id, { role: 'admin' });
  const admin = { id: member.id, role: 'admin' };
  // The takeover the review found: an admin invites a member, the owner promotes the
  // pending account, and the admin uses the link they still hold.
  const invited = inviteMember(db, admin, { username: 'bob.b', displayName: 'Bob', role: 'member' });
  updateMember(db, owner, invited.user.id, { role: 'owner' });
  assert.throws(() => consumeToken(db, { token: invited.token, passwordHash: HASH, purpose: 'invite' }), code('INVALID_TOKEN'));
  assert.equal(db.prepare('SELECT active FROM users WHERE id = ?').get(invited.user.id).active, 0);
  const renewed = renewInvitation(db, owner, invited.user.id);
  consumeToken(db, { token: renewed.token, passwordHash: HASH, purpose: 'invite' });

  const reset = issueReset(db, admin, member2.id);
  updateMember(db, owner, member2.id, { role: 'admin' });
  assert.throws(() => consumeToken(db, { token: reset.token, passwordHash: HASH, purpose: 'reset' }), code('INVALID_TOKEN'));
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(member2.id).password_hash, 'fixture-no-login');
});

test('a link stops working when whoever made it can no longer manage the account', t => {
  const { db, owner, member, member2 } = fixture(t);
  updateMember(db, owner, member.id, { role: 'admin' });
  const admin = { id: member.id, role: 'admin' };
  const carol = inviteMember(db, admin, { username: 'carol', displayName: 'Carol', role: 'member' });
  const reset = issueReset(db, admin, member2.id);
  const ownerMade = inviteMember(db, owner, { username: 'dave', displayName: 'Dave', role: 'member' });

  updateMember(db, owner, member.id, { role: 'member' });
  assert.throws(() => consumeToken(db, { token: reset.token, passwordHash: HASH, purpose: 'reset' }), code('INVALID_TOKEN'));
  updateMember(db, owner, member.id, { active: false });
  assert.throws(() => consumeToken(db, { token: carol.token, passwordHash: HASH, purpose: 'invite' }), code('INVALID_TOKEN'));
  // Links from someone who can still manage the account keep working.
  consumeToken(db, { token: ownerMade.token, passwordHash: HASH, purpose: 'invite' });
});

test('over HTTP, an admin cannot turn an invitation into an owner account', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const { api: admin } = await joinTeam(server, owner, { username: 'ada', role: 'admin' });
  const invite = await admin.request('POST', '/api/admin/invitations', { username: 'bob.b', displayName: 'Bob', role: 'member' });
  assert.equal((await owner.request('PATCH', `/api/admin/members/${invite.body.user.id}`, { role: 'owner' })).status, 200);
  const stranger = client(server.base);
  await stranger.bootstrap();
  const accepted = await stranger.request('POST', '/api/invitations/accept',
    { token: new URL(invite.body.invitationUrl).hash.slice('#invite='.length), password: PASSWORD });
  assert.equal(accepted.status, 400);
  assert.equal(accepted.body.error.code, 'INVALID_TOKEN');
});
