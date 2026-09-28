import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { authenticatedClient, joinTeam, setupOrganization, startServer } from './helpers.mjs';

let keys = 0;
const key = () => ({ 'idempotency-key': `api-test-request-${String(++keys).padStart(5, '0')}` });

async function team(t, { mode = 'credit' } = {}) {
  const server = await startServer(t);
  const { api: owner, user: ownerUser } = await setupOrganization(server, { mode });
  const one = await joinTeam(server, owner, { username: 'mina', displayName: 'Mina' });
  const two = await joinTeam(server, owner, { username: 'moe', displayName: 'Moe' });
  return { server, owner, ownerUser, member: one.api, memberUser: one.user, member2: two.api, member2User: two.user };
}

async function giveCoffee(owner, amount = '12.50', mode = 'credit') {
  const created = await owner.request('POST', '/api/admin/rewards', { name: 'Coffee', description: 'One drink', amount, mode, active: true });
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
