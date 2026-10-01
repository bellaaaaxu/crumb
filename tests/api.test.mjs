import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { authenticatedClient, joinTeam, setupOrganization, startServer } from './helpers.mjs';

let keys = 0;
const key = () => ({ 'idempotency-key': `api-test-request-${String(++keys).padStart(5, '0')}` });

async function team(t, { mode = 'credit' } = {}) {
  const server = await startServer(t);
  const { api: owner, user: ownerUser } = await setupOrganization(server, { mode, org: { spending: 'confirm' } });
  const one = await joinTeam(server, owner, { username: 'mina', displayName: 'Mina' });
  const two = await joinTeam(server, owner, { username: 'moe', displayName: 'Moe' });
  return { server, owner, ownerUser, member: one.api, memberUser: one.user, member2: two.api, member2User: two.user };
}

async function giveCoffee(owner, amount = '12.50', mode = 'credit') {
  const created = await owner.request('POST', '/api/admin/rewards', { name: 'Coffee', description: 'One drink', amount, mode, active: true }, key());
  assert.equal(created.status, 201);
  return created.body;
}

test('member cannot list team members or grant rewards', async t => {
  const {api} = await authenticatedClient(t,{role:'member'});
  assert.equal((await api.request('GET','/api/admin/members')).status,403);
  assert.equal((await api.request('POST','/api/admin/grants',{
    userId:'another-user',amount:'50',reason:'forged'
  },{'Idempotency-Key':'unauthorized-key-01'})).status,403);
});

test('every management endpoint refuses members', async t => {
  const { member, memberUser } = await team(t);
  const id = memberUser.id;
  const attempts = [
    ['GET', '/api/admin/members'], ['GET', '/api/admin/redemptions'], ['GET', '/api/admin/rewards'],
    ['GET', '/api/admin/ledger'], ['GET', '/api/admin/audit'],
    ['POST', '/api/admin/rewards', { name: 'Free', description: '', amount: '1.00', active: true }],
    ['PATCH', `/api/admin/rewards/${id}`, { active: false }],
    ['POST', `/api/admin/grants/${id}/revoke`, { reason: 'x' }],
    ['POST', `/api/admin/redemptions/${id}/complete`], ['POST', `/api/admin/redemptions/${id}/reject`, {}],
    ['POST', `/api/admin/redemptions/${id}/refund`, { reason: 'x' }],
  ];
  for (const [method, path, body] of attempts)
    assert.equal((await member.request(method, path, body, key())).status, 403, `${method} ${path}`);
});

test('a grant made by the owner shows up for that member and no one else', async t => {
  const { owner, member, member2, memberUser } = await team(t);
  const granted = await owner.request('POST', '/api/admin/grants',
    { userId: memberUser.id, amount: '50.00', mode: 'credit', reason: 'Thanks for covering <b>Sunday</b>' }, key());
  assert.equal(granted.status, 201);
  assert.equal(granted.body.balance.availableUnits, 5000);
  assert.equal(granted.body.collection.length, 1);

  const me = await member.request('GET', '/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'mina');
  assert.deepEqual(me.body.balance, { postedUnits: 5000, reservedUnits: 0, availableUnits: 5000, lifetimeUnits: 5000 });
  assert.equal(me.body.collection.length, 1);
  const [item] = me.body.collection;
  assert.equal(item.ordinal, 0);
  assert.ok(item.names.en && item.names['zh-CN']);
  assert.equal(me.body.theme.size, 39);
  assert.equal(me.body.theme.complete, false);
  assert.ok(me.body.theme.next.spriteKey);
  assert.equal(me.body.org.mode, 'credit');

  const history = await member.request('GET', '/api/me/ledger');
  assert.equal(history.body.items.length, 1);
  assert.equal(history.body.items[0].reason, 'Thanks for covering <b>Sunday</b>');
  assert.equal(history.body.items[0].actorName, 'Olive Owner');
  assert.equal(history.body.items[0].revoked, false);

  const other = await member2.request('GET', '/api/me');
  assert.equal(other.body.balance.postedUnits, 0);
  assert.deepEqual((await member2.request('GET', '/api/me/ledger')).body.items, []);
  assert.deepEqual(other.body.collection, []);
});

test('forged identity fields are refused, not obeyed', async t => {
  const { owner, member, memberUser, member2User, ownerUser } = await team(t);
  const coffee = await giveCoffee(owner, '1.00');
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '5.00', mode: 'credit', reason: '' }, key());

  const forged = await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits, actorId: ownerUser.id }, key());
  assert.equal(forged.status, 422);
  assert.equal(forged.body.error.code, 'UNKNOWN_FIELD');
  const asOther = await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits, userId: member2User.id }, key());
  assert.equal(asOther.status, 422);
  const role = await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '1.00', mode: 'credit', reason: '', role: 'owner' }, key());
  assert.equal(role.status, 422);
  const peek = await member.request('GET', `/api/me/ledger?userId=${member2User.id}`);
  assert.equal(peek.status, 422);
  const units = await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: 500, mode: 'credit', reason: '' }, key());
  assert.equal(units.status, 422, 'a JSON number is not accepted as an amount');
  assert.equal(units.body.error.code, 'INVALID_AMOUNT');
});

test('another member\'s request looks like it does not exist', async t => {
  const { owner, member, member2, memberUser } = await team(t);
  const coffee = await giveCoffee(owner, '1.00');
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '5.00', mode: 'credit', reason: '' }, key());
  const mine = await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits }, key());
  assert.equal(mine.status, 201);
  const theirs = await member2.request('POST', `/api/redemptions/${mine.body.redemption.id}/cancel`, undefined, key());
  assert.equal(theirs.status, 404);
  assert.deepEqual((await member2.request('GET', '/api/me/redemptions')).body.items, []);
  const cancelled = await member.request('POST', `/api/redemptions/${mine.body.redemption.id}/cancel`, undefined, key());
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.redemption.status, 'cancelled');
});

test('management lists never include secrets', async t => {
  const { owner } = await team(t);
  const members = await owner.request('GET', '/api/admin/members');
  assert.equal(members.status, 200);
  assert.equal(members.body.items.length, 3);
  const text = JSON.stringify(members.body);
  assert.doesNotMatch(text, /password|scrypt|token|csrf|session/i);
  for (const item of members.body.items) {
    assert.deepEqual(Object.keys(item).sort(),
      ['balance', 'createdAt', 'deactivatedAt', 'displayName', 'id', 'role', 'status', 'username']);
  }
});

test('the full journey works through the API, with retries that do not double anything', async t => {
  const { owner, member, memberUser, server } = await team(t, { mode: 'points' });
  const coffee = await giveCoffee(owner, '40', 'points');
  const grantKey = key();
  const body = { userId: memberUser.id, amount: '100', mode: 'points', reason: 'Great week' };
  const first = await owner.request('POST', '/api/admin/grants', body, grantKey);
  const retry = await owner.request('POST', '/api/admin/grants', body, grantKey);
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.deepEqual(retry.body, first.body);
  // The retry says it is a stored answer, so the page can say "already recorded".
  assert.equal(first.headers.get('idempotent-replayed'), null);
  assert.equal(retry.headers.get('idempotent-replayed'), 'true');
  const changed = await owner.request('POST', '/api/admin/grants', { ...body, amount: '200' }, grantKey);
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error.code, 'IDEMPOTENCY_CONFLICT');
  const noKey = await owner.request('POST', '/api/admin/grants', body);
  assert.equal(noKey.status, 422);
  assert.equal(noKey.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');

  const requestKey = key();
  const requested = await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits }, requestKey);
  assert.equal(requested.status, 201);
  assert.equal(requested.body.balance.availableUnits, 60);
  assert.equal((await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits }, requestKey)).body.redemption.id,
    requested.body.redemption.id);

  const pending = await owner.request('GET', '/api/admin/redemptions?status=pending');
  assert.equal(pending.body.items.length, 1);
  assert.equal(pending.body.items[0].member.displayName, 'Mina');
  server.time.now += 1000;
  const completeKey = key();
  const done = await owner.request('POST', `/api/admin/redemptions/${requested.body.redemption.id}/complete`, undefined, completeKey);
  assert.equal(done.status, 200);
  assert.equal((await owner.request('POST', `/api/admin/redemptions/${requested.body.redemption.id}/complete`, undefined, completeKey)).status, 200);
  const again = await owner.request('POST', `/api/admin/redemptions/${requested.body.redemption.id}/complete`, undefined, key());
  assert.equal(again.status, 409);

  const me = await member.request('GET', '/api/me');
  assert.deepEqual(me.body.balance, { postedUnits: 60, reservedUnits: 0, availableUnits: 60, lifetimeUnits: 100 });
  assert.equal(me.body.collection.length, 1);
  const kinds = (await member.request('GET', '/api/me/ledger')).body.items.map(item => [item.kind, item.deltaUnits, item.rewardName ?? null]);
  assert.deepEqual(kinds, [['redeem', -40, 'Coffee'], ['grant', 100, null]]);
  assert.equal(server.db.prepare(`SELECT count(*) AS n FROM ledger`).get().n, 2);
});

test('an unaffordable request fails cleanly and changes nothing', async t => {
  const { owner, member, memberUser, server } = await team(t);
  const coffee = await giveCoffee(owner, '12.50');
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '10.00', mode: 'credit', reason: '' }, key());
  const refused = await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits }, key());
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'INSUFFICIENT_BALANCE');
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM redemptions').get().n, 0);
  assert.deepEqual((await member.request('GET', '/api/me')).body.balance,
    { postedUnits: 1000, reservedUnits: 0, availableUnits: 1000, lifetimeUnits: 1000 });
});

test('a busy database answers 503 and the same key succeeds afterwards', async t => {
  const { owner, memberUser, server } = await team(t);
  server.db.pragma('busy_timeout = 200');
  const blocker = new Database(server.config.dbPath);
  blocker.prepare('BEGIN IMMEDIATE').run();
  const retryKey = key();
  const body = { userId: memberUser.id, amount: '5.00', mode: 'credit', reason: 'Busy day' };
  let busy;
  try {
    busy = await owner.request('POST', '/api/admin/grants', body, retryKey);
  } finally {
    blocker.prepare('ROLLBACK').run();
    blocker.close();
  }
  assert.equal(busy.status, 503);
  assert.equal(busy.body.error.code, 'RETRY_LATER');
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM ledger').get().n, 0);
  const later = await owner.request('POST', '/api/admin/grants', body, retryKey);
  assert.equal(later.status, 201);
});

test('pages never repeat or skip rows that share a timestamp', async t => {
  const { owner, memberUser, member, server } = await team(t, { mode: 'points' });
  for (let i = 0; i < 7; i += 1)
    assert.equal((await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: String(i + 1), mode: 'points', reason: `#${i}` }, key())).status, 201);
  assert.equal(server.db.prepare('SELECT count(DISTINCT created_at) AS n FROM ledger').get().n, 1, 'all rows share one time');

  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const response = await member.request('GET', `/api/me/ledger?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(response.status, 200);
    seen.push(...response.body.items.map(item => item.id));
    cursor = response.body.nextCursor;
    pages += 1;
  } while (cursor);
  assert.equal(pages, 4);
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7);

  for (const bad of ['limit=0', 'limit=101', 'limit=abc', 'cursor=not-a-cursor', 'cursor=W10', 'limit=5&limit=6'])
    assert.equal((await member.request('GET', `/api/me/ledger?${bad}`)).status, 422, bad);
});

test('admins see the ledger with names, revoke from it, and read the activity log', async t => {
  const { owner, memberUser, server } = await team(t);
  const granted = await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '5.00', mode: 'credit', reason: 'Wrong person' }, key());
  const ledger = await owner.request('GET', `/api/admin/ledger?userId=${memberUser.id}`);
  assert.equal(ledger.body.items.length, 1);
  assert.equal(ledger.body.items[0].member.displayName, 'Mina');
  assert.equal(ledger.body.items[0].actor.displayName, 'Olive Owner');
  server.time.now += 1000;
  const revoked = await owner.request('POST', `/api/admin/grants/${granted.body.entry.id}/revoke`, { reason: 'Meant for Mo' }, key());
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.balance.postedUnits, 0);
  const after = await owner.request('GET', '/api/admin/ledger');
  assert.deepEqual(after.body.items.map(item => [item.kind, item.revoked]), [['revoke', false], ['grant', true]]);
  const audit = await owner.request('GET', '/api/admin/audit?limit=3');
  assert.equal(audit.status, 200);
  assert.equal(audit.body.items[0].action, 'grant.revoke');
  assert.equal(audit.body.items[0].actor.displayName, 'Olive Owner');
  assert.doesNotMatch(JSON.stringify(audit.body), /invite=|reset=|scrypt/);
});

test('an admin reads the activity log as an owner does; a team member cannot', async t => {
  const { server, owner, member, memberUser } = await team(t);
  const { api: admin } = await joinTeam(server, owner, { username: 'ada', displayName: 'Ada Lee', role: 'admin' });
  // Rows made at the same instant come in id order, so the treat is made a moment later.
  server.time.now += 1000;
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '5.00', mode: 'credit', reason: '' }, key());
  const read = await admin.request('GET', '/api/admin/audit?limit=5');
  assert.equal(read.status, 200);
  const treat = read.body.items.find(item => item.action === 'grant.create');
  assert.equal(treat.actor.displayName, 'Olive Owner');
  assert.equal(treat.detail.userId, memberUser.id);
  assert.equal((await member.request('GET', '/api/admin/audit?limit=5')).status, 403);
});

test('catalog edits go through the organization unit', async t => {
  const { owner, member } = await team(t, { mode: 'points' });
  assert.equal((await owner.request('POST', '/api/admin/rewards', { name: 'Coffee', description: '', amount: '1.50', mode: 'points', active: true })).status, 422);
  const coffee = await giveCoffee(owner, '40', 'points');
  assert.equal(coffee.costUnits, 40);
  const edited = await owner.request('PATCH', `/api/admin/rewards/${coffee.id}`, { amount: '45', mode: 'points', description: 'Any size' });
  assert.equal(edited.body.costUnits, 45);
  assert.equal(edited.body.description, 'Any size');
  assert.equal((await owner.request('PATCH', `/api/admin/rewards/${coffee.id}`, { costUnits: 1 })).status, 422);
  assert.equal((await owner.request('PATCH', '/api/admin/rewards/not-an-id', { active: false })).status, 404);
  await owner.request('PATCH', `/api/admin/rewards/${coffee.id}`, { active: false });
  assert.deepEqual((await member.request('GET', '/api/rewards')).body.items, []);
  assert.equal((await owner.request('GET', '/api/admin/rewards')).body.items.length, 1);
});

test('amounts carry the unit they were typed in; requests carry the price the member saw', async t => {
  const { owner, member, memberUser, server } = await team(t);
  // "12" typed as points while the team counts credit would be 12 cents: refused, nothing recorded.
  const misread = await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '12', mode: 'points', reason: '' }, key());
  assert.equal(misread.status, 409);
  assert.equal(misread.body.error.code, 'RULES_CHANGED');
  const noMode = await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '12', reason: '' }, key());
  assert.equal(noMode.status, 422);
  assert.equal(noMode.body.error.field, 'mode');
  const unpricedBenefit = await owner.request('POST', '/api/admin/rewards', { name: 'Tea', description: '', amount: '3', active: true });
  assert.equal(unpricedBenefit.body.error.field, 'mode');
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM ledger').get().n, 0);

  const coffee = await giveCoffee(owner, '1.00');
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '5.00', mode: 'credit', reason: '' }, key());
  assert.equal((await owner.request('PATCH', `/api/admin/rewards/${coffee.id}`, { amount: '2.00', mode: 'credit' })).status, 200);
  const stale = await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: 100 }, key());
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'PRICE_CHANGED');
  const unpriced = await member.request('POST', '/api/redemptions', { rewardId: coffee.id }, key());
  assert.equal(unpriced.status, 422);
  assert.equal(unpriced.body.error.field, 'expectedCostUnits');
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM redemptions').get().n, 0);
  assert.equal((await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: 200 }, key())).status, 201);
});

test('adding a benefit again with the same key does not create a second one', async t => {
  const { owner, server } = await team(t);
  const body = { name: 'Coffee', description: 'One drink', amount: '3.00', mode: 'credit', active: true };
  const addKey = key();
  const first = await owner.request('POST', '/api/admin/rewards', body, addKey);
  const retry = await owner.request('POST', '/api/admin/rewards', body, addKey);
  assert.equal(first.status, 201);
  assert.deepEqual(retry.body, first.body);
  assert.equal((await owner.request('POST', '/api/admin/rewards', { ...body, name: 'Tea' }, addKey)).body.error.code, 'IDEMPOTENCY_CONFLICT');
  // The icon is part of the request too: a resend that picks one is a different benefit, not a replay.
  assert.equal((await owner.request('POST', '/api/admin/rewards', { ...body, iconKey: 'tart' }, addKey)).body.error.code, 'IDEMPOTENCY_CONFLICT');
  const keyless = await owner.request('POST', '/api/admin/rewards', body);
  assert.equal(keyless.status, 422);
  assert.equal(keyless.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM rewards').get().n, 1);
});

test('signed-out visitors get 401 from every data endpoint', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  const { client } = await import('./helpers.mjs');
  const visitor = client(server.base);
  await visitor.bootstrap();
  for (const path of ['/api/me', '/api/me/ledger', '/api/me/redemptions', '/api/rewards', '/api/admin/members'])
    assert.equal((await visitor.request('GET', path)).status, 401, path);
  assert.equal((await visitor.request('POST', '/api/redemptions', { rewardId: 'x' }, key())).status, 401);
});

test('permission comes before any other check, and unknown query parameters are refused', async t => {
  const { server, member, memberUser, owner } = await team(t);
  const { client } = await import('./helpers.mjs');
  const visitor = client(server.base);
  await visitor.bootstrap();
  for (const path of [`/api/admin/members/${memberUser.id}/invitation`, `/api/admin/members/${memberUser.id}/reset`]) {
    assert.equal((await visitor.request('POST', path, { junk: 1 })).status, 401, path);
    assert.equal((await member.request('POST', path, { junk: 1 })).status, 403, path);
  }
  assert.equal((await visitor.request('GET', '/api/session?debug=1')).status, 422);
  assert.equal((await visitor.request('GET', '/api/org/logo?debug=1')).status, 422);
  assert.equal((await visitor.request('GET', '/api/org/logo?v=123')).status, 404, 'the cache-busting parameter is allowed');
  assert.equal((await owner.request('GET', '/api/session')).status, 200);
});

test('the CSV export cannot be triggered from another site', async t => {
  const { server, owner } = await team(t);
  const exports = () => server.db.prepare(`SELECT count(*) AS n FROM audit WHERE action = 'ledger.export'`).get().n;
  const crossSite = await owner.request('GET', '/api/admin/ledger.csv', undefined, { 'sec-fetch-site': 'cross-site' });
  assert.equal(crossSite.status, 403);
  assert.equal((await owner.request('GET', '/api/admin/ledger.csv', undefined, { 'sec-fetch-site': 'same-site' })).status, 403);
  assert.equal(exports(), 0, 'a refused export leaves no trace in the activity log');
  for (const site of ['same-origin', 'none', undefined])
    assert.equal((await owner.request('GET', '/api/admin/ledger.csv', undefined, { 'sec-fetch-site': site })).status, 200, String(site));
  assert.equal(exports(), 3);
});

test('a refunded redemption is marked on its ledger row', async t => {
  const { owner, member, memberUser, server } = await team(t);
  const coffee = await giveCoffee(owner, '1.00');
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '5.00', mode: 'credit', reason: '' }, key());
  const requested = await member.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits }, key());
  server.time.now += 1000;
  assert.equal((await owner.request('POST', `/api/admin/redemptions/${requested.body.redemption.id}/complete`, undefined, key())).status, 200);
  const redeemRow = async () => (await owner.request('GET', '/api/admin/ledger?kind=redeem')).body.items[0];
  assert.equal((await redeemRow()).refunded, false);
  server.time.now += 1000;
  const refunded = await owner.request('POST', `/api/admin/redemptions/${requested.body.redemption.id}/refund`, { reason: 'Machine was broken' }, key());
  assert.equal(refunded.status, 200);
  const row = await redeemRow();
  assert.equal(row.refunded, true);
  assert.equal(row.revoked, false);
  // A refund is not a correction, so the log's revoked/voided badge stays off this row.
  assert.equal(row.corrected, false);
  assert.equal((await owner.request('GET', '/api/admin/ledger?kind=refund')).body.items[0].refunded, false);
});

async function selfTeam(t, { mode = 'credit' } = {}) {
  const server = await startServer(t);
  const { api: owner, user: ownerUser } = await setupOrganization(server, { mode, org: { spending: 'self' } });
  const one = await joinTeam(server, owner, { username: 'mina', displayName: 'Mina' });
  return { server, owner, ownerUser, member: one.api, memberUser: one.user };
}

test('a member records an entry over the API and a manager corrects it', async t => {
  const { owner, member, memberUser, server } = await selfTeam(t);
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '50.00', mode: 'credit', reason: '' }, key());
  // Later than the grant, so the newest-first history has one fixed order.
  server.time.now += 1000;
  const refused = await member.request('POST', '/api/me/spend', { amount: '60.00', mode: 'credit' }, key());
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'INSUFFICIENT_BALANCE');
  const spendKey = key();
  const spent = await member.request('POST', '/api/me/spend', { amount: '12.50', mode: 'credit' }, spendKey);
  assert.equal(spent.status, 201);
  assert.equal(spent.body.balance.availableUnits, 3750);
  const again = await member.request('POST', '/api/me/spend', { amount: '12.50', mode: 'credit' }, spendKey);
  assert.equal(again.status, 201);
  assert.equal(again.headers.get('idempotent-replayed'), 'true');
  assert.equal((await member.request('POST', '/api/me/spend', { amount: '12.50' }, key())).status, 422, 'mode is required');
  assert.equal((await member.request('POST', '/api/me/spend', { amount: '1.00', mode: 'credit' })).status, 422, 'a key is required');

  const ledger = await member.request('GET', '/api/me/ledger');
  assert.deepEqual(ledger.body.items.map(item => [item.kind, item.deltaUnits, item.corrected]), [['spend', -1250, false], ['grant', 5000, false]]);
  const spends = await owner.request('GET', '/api/admin/ledger?kind=spend');
  assert.deepEqual(spends.body.items.map(item => item.id), [spent.body.entry.id]);
  const voidPath = `/api/admin/spends/${spent.body.entry.id}/void`;
  assert.equal((await member.request('POST', voidPath, { reason: 'x' }, key())).status, 403);
  // Each refusal below comes before any write, so the void after them is still the first one.
  const refusal = async (path, body, headers) => {
    const response = await owner.request('POST', path, body, headers);
    return [response.status, response.body.error.code];
  };
  assert.deepEqual(await refusal(voidPath, { reason: '' }, key()), [422, 'INVALID_INPUT'], 'a reason is required');
  assert.deepEqual(await refusal(voidPath, { reason: 'x', amount: '1.00' }, key()), [422, 'UNKNOWN_FIELD']);
  assert.deepEqual(await refusal(voidPath, { reason: 'x' }), [422, 'IDEMPOTENCY_KEY_REQUIRED']);
  for (const id of [randomUUID(), 'not-an-entry'])
    assert.deepEqual(await refusal(`/api/admin/spends/${id}/void`, { reason: 'x' }, key()), [404, 'ENTRY_NOT_FOUND'], id);
  const voidKey = key();
  const fixed = await owner.request('POST', voidPath, { reason: 'Keyed in twice' }, voidKey);
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.balance.availableUnits, 5000);
  const replayed = await owner.request('POST', voidPath, { reason: 'Keyed in twice' }, voidKey);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.headers.get('idempotent-replayed'), 'true');
  assert.deepEqual(await refusal(voidPath, { reason: 'Keyed in twice' }, key()), [409, 'ALREADY_CORRECTED']);
  const after = await owner.request('GET', '/api/admin/ledger?kind=void');
  assert.equal(after.body.items.length, 1);
  assert.equal(after.body.items[0].member.id, memberUser.id);
  const corrected = await member.request('GET', '/api/me/ledger');
  assert.equal(corrected.body.items.find(item => item.kind === 'spend').corrected, true);
});

test('a self-recorded entry in points is a whole number', async t => {
  const { owner, member, memberUser } = await selfTeam(t, { mode: 'points' });
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '50', mode: 'points', reason: '' }, key());
  for (const amount of ['1.5', '1,5', '1.0']) {
    const refused = await member.request('POST', '/api/me/spend', { amount, mode: 'points' }, key());
    assert.deepEqual([refused.status, refused.body.error.code], [422, 'INVALID_AMOUNT'], amount);
  }
  assert.equal((await member.request('GET', '/api/me')).body.balance.availableUnits, 50);
  const spent = await member.request('POST', '/api/me/spend', { amount: '12', mode: 'points' }, key());
  assert.deepEqual([spent.status, spent.body.balance.availableUnits], [201, 38]);
});

test('self-recorded entries are refused over the API in a team that confirms requests', async t => {
  const { member } = await team(t);
  const refused = await member.request('POST', '/api/me/spend', { amount: '1.00', mode: 'credit' }, key());
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'SPENDING_MODE');
});

test('requests are refused over the API in a self-recording team', async t => {
  const { owner, member } = await selfTeam(t);
  const created = await owner.request('POST', '/api/admin/rewards', { name: 'Coffee', description: '', amount: '4.50', mode: 'credit', active: true }, key());
  assert.equal(created.status, 201);
  const refused = await member.request('POST', '/api/redemptions', { rewardId: created.body.id, expectedCostUnits: 450 }, key());
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'SPENDING_MODE');
});

test('a batch treat over the API', async t => {
  const { owner, member, member2, memberUser, member2User } = await team(t);
  const batchKey = key();
  const sent = await owner.request('POST', '/api/admin/grants/batch',
    { userIds: [memberUser.id, member2User.id], amount: '20.00', mode: 'credit', reason: 'Mid-Autumn' }, batchKey);
  assert.equal(sent.status, 201);
  assert.equal(sent.body.count, 2);
  assert.equal((await member.request('GET', '/api/me')).body.balance.availableUnits, 2000);
  assert.equal((await member2.request('GET', '/api/me')).body.balance.availableUnits, 2000);
  const again = await owner.request('POST', '/api/admin/grants/batch',
    { userIds: [member2User.id, memberUser.id], amount: '20.00', mode: 'credit', reason: 'Mid-Autumn' }, batchKey);
  assert.equal(again.headers.get('idempotent-replayed'), 'true');
  const log = await owner.request('GET', '/api/admin/ledger?kind=grant');
  // Compared with the id itself: a missing batchId would also make a set of one.
  assert.deepEqual([...new Set(log.body.items.map(item => item.batchId))], [sent.body.batchId]);
  assert.equal((await member.request('POST', '/api/admin/grants/batch', { userIds: [memberUser.id], amount: '1', mode: 'credit' }, key())).status, 403);
});

test('the Team log counts a batch on every row of it, and lists one batch on its own', async t => {
  const { owner, memberUser, member2User, ownerUser, server } = await team(t);
  const sent = await owner.request('POST', '/api/admin/grants/batch',
    { userIds: [memberUser.id, member2User.id, ownerUser.id], amount: '20.00', mode: 'credit', reason: 'Mid-Autumn' }, key());
  assert.equal(sent.status, 201);
  server.time.now += 1000;
  await owner.request('POST', '/api/admin/grants', { userId: memberUser.id, amount: '5.00', mode: 'credit', reason: '' }, key());
  server.time.now += 1000;
  // Taking back one person's treat adds a row outside the batch; the batch still counts three.
  const mina = sent.body.entries.find(entry => entry.userId === memberUser.id);
  assert.equal((await owner.request('POST', `/api/admin/grants/${mina.id}/revoke`, { reason: 'Not on shift' }, key())).status, 200);

  const log = await owner.request('GET', '/api/admin/ledger');
  assert.deepEqual(log.body.items.map(item => [item.kind, item.batchId, item.batchSize]), [
    ['revoke', null, null], ['grant', null, null],
    ...sent.body.entries.map(() => ['grant', sent.body.batchId, 3]),
  ]);
  // A page that ends inside the batch still says how big the whole batch is.
  const first = await owner.request('GET', '/api/admin/ledger?limit=3');
  assert.equal(first.body.items.at(-1).batchSize, 3);

  const batch = await owner.request('GET', `/api/admin/ledger?batchId=${sent.body.batchId}&limit=2`);
  assert.equal(batch.status, 200);
  assert.equal(batch.body.items.length, 2);
  const rest = await owner.request('GET', `/api/admin/ledger?batchId=${sent.body.batchId}&cursor=${batch.body.nextCursor}`);
  assert.equal(rest.body.nextCursor, null);
  const rows = [...batch.body.items, ...rest.body.items];
  assert.deepEqual(rows.map(item => item.member.id).sort(), [memberUser.id, member2User.id, ownerUser.id].sort());
  for (const row of rows) {
    assert.deepEqual([row.kind, row.batchId, row.batchSize], ['grant', sent.body.batchId, 3]);
    assert.equal(row.revoked, row.member.id === memberUser.id, row.member.displayName);
  }
  assert.deepEqual((await owner.request('GET', `/api/admin/ledger?batchId=${randomUUID()}`)).body.items, []);
  for (const bad of ['not-a-batch', '', `${sent.body.batchId}x`]) {
    const refused = await owner.request('GET', `/api/admin/ledger?batchId=${encodeURIComponent(bad)}`);
    assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.field], [422, 'INVALID_INPUT', 'batchId'], bad);
  }
});

test('a benefit icon travels through the API, survives an edit without it, and null clears it', async t => {
  const { owner, member } = await team(t);
  const created = await owner.request('POST', '/api/admin/rewards',
    { name: 'Coffee', description: '', amount: '4.50', mode: 'credit', active: true, iconKey: 'tart' }, key());
  assert.equal(created.status, 201);
  assert.equal(created.body.iconKey, 'tart');
  assert.deepEqual((await member.request('GET', '/api/rewards')).body.items.map(item => item.iconKey), ['tart']);
  // A price change as the current admin form sends it, with no iconKey.
  const repriced = await owner.request('PATCH', `/api/admin/rewards/${created.body.id}`, { amount: '5.00', mode: 'credit' });
  assert.deepEqual([repriced.status, repriced.body.costUnits, repriced.body.iconKey], [200, 500, 'tart']);
  assert.deepEqual((await member.request('GET', '/api/rewards')).body.items.map(item => item.iconKey), ['tart']);
  const unknown = await owner.request('PATCH', `/api/admin/rewards/${created.body.id}`, { iconKey: 'unicorn' });
  assert.deepEqual([unknown.status, unknown.body.error.field], [422, 'iconKey']);
  const cleared = await owner.request('PATCH', `/api/admin/rewards/${created.body.id}`, { iconKey: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.iconKey, null);
  assert.deepEqual((await owner.request('GET', '/api/admin/rewards')).body.items.map(item => item.iconKey), [null]);
});

test('a member lists their own requests by status, and only a known status', async t => {
  const { owner, member, member2, memberUser, member2User, server } = await team(t);
  const coffee = await giveCoffee(owner, '1.00');
  for (const userId of [memberUser.id, member2User.id])
    await owner.request('POST', '/api/admin/grants', { userId, amount: '10.00', mode: 'credit', reason: '' }, key());
  const ask = async api => {
    server.time.now += 1000;
    const made = await api.request('POST', '/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits }, key());
    assert.equal(made.status, 201);
    return made.body.redemption.id;
  };
  // Oldest first: one waiting, then one of each finished state, then another waiting.
  const olderWaiting = await ask(member);
  const completed = await ask(member);
  const cancelled = await ask(member);
  const rejected = await ask(member);
  const newerWaiting = await ask(member);
  await ask(member2);
  assert.equal((await owner.request('POST', `/api/admin/redemptions/${completed}/complete`, undefined, key())).status, 200);
  assert.equal((await member.request('POST', `/api/redemptions/${cancelled}/cancel`, undefined, key())).status, 200);
  assert.equal((await owner.request('POST', `/api/admin/redemptions/${rejected}/reject`, { reason: 'Out of beans' }, key())).status, 200);

  const ids = async path => (await member.request('GET', path)).body.items.map(item => item.id);
  assert.deepEqual(await ids('/api/me/redemptions'), [newerWaiting, rejected, cancelled, completed, olderWaiting]);
  assert.deepEqual(await ids('/api/me/redemptions?status=pending'), [newerWaiting, olderWaiting], 'only this member\'s, only waiting');
  assert.deepEqual(await ids('/api/me/redemptions?status=completed'), [completed]);
  assert.deepEqual(await ids('/api/me/redemptions?status=cancelled'), [cancelled]);
  assert.deepEqual(await ids('/api/me/redemptions?status=rejected'), [rejected]);
  // The filter holds across pages: the older waiting request is on the second.
  const first = await member.request('GET', '/api/me/redemptions?status=pending&limit=1');
  assert.deepEqual(first.body.items.map(item => item.id), [newerWaiting]);
  const next = await member.request('GET', `/api/me/redemptions?status=pending&limit=1&cursor=${first.body.nextCursor}`);
  assert.deepEqual([next.body.items.map(item => item.id), next.body.nextCursor], [[olderWaiting], null]);
  // Still listed after the team switches to self-recorded spending, so they can be seen through.
  assert.equal((await owner.request('PATCH', '/api/org', { spending: 'self' })).status, 200);
  assert.deepEqual(await ids('/api/me/redemptions?status=pending'), [newerWaiting, olderWaiting]);

  for (const bad of ['refunded', 'PENDING', '', 'pending,completed']) {
    const refused = await member.request('GET', `/api/me/redemptions?status=${encodeURIComponent(bad)}`);
    assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.field], [422, 'INVALID_INPUT', 'status'], bad);
  }
  const twice = await member.request('GET', '/api/me/redemptions?status=pending&status=completed');
  assert.deepEqual([twice.status, twice.body.error.field], [422, 'status']);
});

test('managers get the theme\'s names in every language with the benefits', async t => {
  const { owner, member } = await team(t);
  const { theme } = await import('../server/collections.mjs');
  const listed = await owner.request('GET', '/api/admin/rewards');
  assert.equal(listed.status, 200);
  assert.deepEqual(Object.keys(listed.body).sort(), ['items', 'theme']);
  assert.deepEqual(listed.body.theme, { keys: theme.keys, names: theme.names });
  assert.deepEqual(listed.body.theme.names.tart, { en: 'Egg Tart', 'zh-Hant': '蛋撻', 'zh-CN': '蛋挞' });
  for (const spriteKey of listed.body.theme.keys)
    assert.ok(listed.body.theme.names[spriteKey]?.en && listed.body.theme.names[spriteKey]['zh-CN'], spriteKey);
  // The member's list of benefits stays as it was.
  assert.deepEqual(Object.keys((await member.request('GET', '/api/rewards')).body), ['items']);
});
