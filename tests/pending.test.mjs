import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, pendingKeys } from '../app/pending.js';

/* A stand-in for window.localStorage that outlives each "page": a new pendingKeys()
 * over the same storage is what a reload looks like. */
function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: name => (items.has(name) ? items.get(name) : null),
    setItem: (name, value) => items.set(name, String(value)),
  };
}

const MINA = '6a1f1c9e-0000-4000-8000-000000000001';
const OLIVE = '6a1f1c9e-0000-4000-8000-000000000002';
const GRANT = `grant:${MINA}:100:Thanks for the Sunday shift`;
let counter = 0;
const makeKey = () => `request-key-${String(++counter).padStart(8, '0')}`;

test('a change waiting for its answer keeps its key across a reload, for that person only', async () => {
  const storage = memoryStorage();
  const before = pendingKeys({ storage, makeKey });
  const key = await before.keyFor(OLIVE, GRANT);
  assert.equal(await before.keyFor(OLIVE, GRANT), key, 'the same change again is the same request');

  const afterReload = pendingKeys({ storage, makeKey });
  assert.equal(await afterReload.keyFor(OLIVE, GRANT), key);
  assert.notEqual(await afterReload.keyFor(MINA, GRANT), key, 'someone else signing in here gets their own key');
  assert.notEqual(await afterReload.keyFor(OLIVE, `grant:${MINA}:200:Thanks for the Sunday shift`), key, 'a different change is a new one');
});

test('a definite answer ends the wait: the same change after that is a new change', async () => {
  const storage = memoryStorage();
  const pending = pendingKeys({ storage, makeKey });
  const first = await pending.keyFor(OLIVE, GRANT);
  await pending.settle(OLIVE, GRANT);
  assert.deepEqual(pending.unconfirmed(OLIVE, 'grant'), []);
  assert.notEqual(await pendingKeys({ storage, makeKey }).keyFor(OLIVE, GRANT), first);
});

test('unanswered changes are listed by kind and person, and forgotten after seven days', async () => {
  let now = Date.parse('2026-09-28T10:00:00Z');
  const storage = memoryStorage();
  const pending = pendingKeys({ storage, makeKey, clock: () => now });
  await pending.keyFor(OLIVE, GRANT);
  now += 60_000;
  await pending.keyFor(OLIVE, 'redeem:coffee:40');
  await pending.keyFor(MINA, 'redeem:tea:15');
  assert.deepEqual(pending.unconfirmed(OLIVE, 'grant'), [Date.parse('2026-09-28T10:00:00Z')]);
  assert.equal(pending.unconfirmed(OLIVE, 'redeem').length, 1);
  assert.equal(pending.unconfirmed(MINA, 'grant').length, 0);
  now += 7 * 24 * 60 * 60 * 1000;
  assert.deepEqual(pending.unconfirmed(OLIVE, 'redeem'), []);
});

test('the browser keeps a key, a fingerprint, a kind and a time — never the change itself', async () => {
  const storage = memoryStorage();
  await pendingKeys({ storage, makeKey }).keyFor(OLIVE, GRANT);
  const saved = [...storage.items.values()].join('');
  for (const secret of ['Thanks for the Sunday shift', MINA, ':100:']) assert.equal(saved.includes(secret), false, secret);
  const [entry] = JSON.parse(storage.items.get('crumb.pending'));
  assert.deepEqual(Object.keys(entry).sort(), ['actor', 'at', 'hash', 'key', 'kind']);
  assert.equal(entry.hash, await fingerprint(GRANT));
  assert.equal(entry.kind, 'grant');
});

test('at most a hundred are kept, and damaged or foreign entries are ignored', async () => {
  const storage = memoryStorage();
  storage.setItem('crumb.pending', JSON.stringify([{ actor: OLIVE, kind: 'grant' }, 'junk', null]));
  const pending = pendingKeys({ storage, makeKey });
  assert.deepEqual(pending.unconfirmed(OLIVE, 'grant'), []);
  for (let i = 0; i < 105; i += 1) await pending.keyFor(OLIVE, `grant:${MINA}:${i + 1}:`);
  assert.equal(JSON.parse(storage.items.get('crumb.pending')).length, 100);
  storage.setItem('crumb.pending', 'not json');
  assert.deepEqual(pending.unconfirmed(OLIVE, 'grant'), []);
});

test('if the browser refuses to store anything, the page still remembers its own keys', async () => {
  const refusing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const pending = pendingKeys({ storage: refusing, makeKey });
  const key = await pending.keyFor(OLIVE, GRANT);
  assert.equal(await pending.keyFor(OLIVE, GRANT), key);
  const blocked = pendingKeys({ storage: null, makeKey });
  const other = await blocked.keyFor(OLIVE, GRANT);
  assert.equal(await blocked.keyFor(OLIVE, GRANT), other);
  await blocked.settle(OLIVE, GRANT);
  assert.notEqual(await blocked.keyFor(OLIVE, GRANT), other);
});
