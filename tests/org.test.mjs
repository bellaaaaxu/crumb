import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeLogo, updateOrg } from '../server/org.mjs';
import { grant } from '../server/ledger.mjs';
import { saveReward } from '../server/rewards.mjs';
import { client, fixture, joinTeam, setupOrganization, startServer } from './helpers.mjs';

const code = expected => error => {
  assert.equal(error.code, expected);
  return true;
};
const solid = (width, height, format = 'png', background = '#E0A73C') =>
  sharp({ create: { width, height, channels: 3, background } })[format]().toBuffer();

test('reward rules can change until the first ledger entry, then they are fixed', t => {
  const { db, owner, member } = fixture(t);
  const points = updateOrg(db, owner, { mode: 'points', threshold: '100', unitLabel: 'stars' });
  assert.deepEqual([points.mode, points.currency, points.thresholdUnits, points.unitLabel], ['points', null, 100, 'stars']);
  const credit = updateOrg(db, owner, { mode: 'credit', currency: 'USD', threshold: '25.00', unitLabel: 'Perk credit' });
  assert.deepEqual([credit.mode, credit.currency, credit.thresholdUnits], ['credit', 'USD', 2500]);

  grant(db, owner, { userId: member.id, units: 500, reason: 'First one', key: 'rules-lock-grant-01' });
  for (const patch of [{ mode: 'points', threshold: '100' }, { currency: 'CAD' }, { threshold: '30.00' }])
    assert.throws(() => updateOrg(db, owner, patch), code('RULES_LOCKED'), JSON.stringify(patch));
  // Restating the current rules is not a change.
  assert.equal(updateOrg(db, owner, { currency: 'USD', threshold: '25.00' }).thresholdUnits, 2500);
  const shown = updateOrg(db, owner, {
    name: 'Corner Café', welcome: 'Thanks for everything.', unitLabel: 'Café credit', locale: 'zh-CN',
    adminContact: 'mailto:manager@example.com', feedbackUrl: 'https://forms.example.com/crumb',
  });
  assert.deepEqual([shown.name, shown.unitLabel, shown.locale, shown.adminContact, shown.feedbackUrl],
    ['Corner Café', 'Café credit', 'zh-CN', 'mailto:manager@example.com', 'https://forms.example.com/crumb']);
  assert.deepEqual(shown.locks, { mode: true, threshold: true });
});

test('a priced catalog fixes the reward type and currency but not the threshold', t => {
  const { db, owner } = fixture(t);
  saveReward(db, owner, { name: 'Coffee', description: '', costUnits: 450, active: true });
  assert.throws(() => updateOrg(db, owner, { mode: 'points', threshold: '100' }), code('RULES_LOCKED'));
  assert.throws(() => updateOrg(db, owner, { currency: 'CNY' }), code('RULES_LOCKED'));
  const org = updateOrg(db, owner, { threshold: '40.00' });
  assert.equal(org.thresholdUnits, 4000);
  assert.deepEqual(org.locks, { mode: true, threshold: false });
});

test('the reward type, currency and threshold must agree', t => {
  const { db, owner } = fixture(t);
  assert.throws(() => updateOrg(db, owner, { mode: 'points' }), code('INVALID_INPUT'), 'a new type needs a new threshold');
  assert.throws(() => updateOrg(db, owner, { mode: 'points', threshold: '100', currency: 'CAD' }), code('INVALID_INPUT'));
  assert.throws(() => updateOrg(db, owner, { threshold: '1.001' }), code('INVALID_AMOUNT'));
  updateOrg(db, owner, { mode: 'points', threshold: '100' });
  assert.throws(() => updateOrg(db, owner, { currency: 'CAD' }), code('INVALID_INPUT'));
  assert.throws(() => updateOrg(db, owner, { mode: 'credit', threshold: '5.00' }), code('INVALID_INPUT'), 'credit needs a currency');
  assert.throws(() => updateOrg(db, owner, { currency: 'EUR' }), code('INVALID_INPUT'));
  assert.throws(() => updateOrg(db, owner, { locale: 'fr' }), code('INVALID_INPUT'));
  assert.throws(() => updateOrg(db, owner, { name: '' }), code('INVALID_INPUT'));
  assert.throws(() => updateOrg(db, owner, { welcome: 'x'.repeat(501) }), code('INVALID_INPUT'));
  assert.throws(() => updateOrg(db, owner, { unitLabel: 'x'.repeat(25) }), code('INVALID_INPUT'));
  assert.throws(() => updateOrg(db, owner, { logo: 'x' }), code('UNKNOWN_FIELD'));
});

test('contact and feedback links only use safe schemes', t => {
  const { db, owner } = fixture(t);
  for (const adminContact of ['https://intranet.example.com/help', 'mailto:hr@example.com', ''])
    assert.equal(updateOrg(db, owner, { adminContact }).adminContact, adminContact);
  for (const adminContact of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.com', 'mailto:',
    'mailto:not an address', 'ftp://example.com', 'example.com', 'https://user:pw@example.com', 'vbscript:x'])
    assert.throws(() => updateOrg(db, owner, { adminContact }), code('INVALID_INPUT'), adminContact);
  assert.equal(updateOrg(db, owner, { feedbackUrl: 'https://github.com/example/crumb/issues' }).feedbackUrl,
    'https://github.com/example/crumb/issues');
  for (const feedbackUrl of ['mailto:me@example.com', 'http://forms.example.com', 'javascript:alert(1)'])
    assert.throws(() => updateOrg(db, owner, { feedbackUrl }), code('INVALID_INPUT'), feedbackUrl);
  assert.equal(updateOrg(db, owner, { feedbackUrl: '' }).feedbackUrl, '');
});

test('only owners change organization settings, and each change is audited', t => {
  const { db, owner, member, member2 } = fixture(t);
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(member2.id);
  assert.throws(() => updateOrg(db, { id: member2.id, role: 'admin' }, { name: 'Admin was here' }), code('FORBIDDEN'));
  assert.throws(() => updateOrg(db, member, { name: 'Member was here' }), code('FORBIDDEN'));
  updateOrg(db, owner, { name: 'Renamed', welcome: 'Hello' });
  const audit = db.prepare(`SELECT actor_id, detail_json FROM audit WHERE action = 'org.update'`).get();
  assert.equal(audit.actor_id, owner.id);
  assert.deepEqual(JSON.parse(audit.detail_json).changed.sort(), ['name', 'welcome']);
});

test('a logo is decoded, shrunk to 512 pixels and re-encoded as PNG', async () => {
  const small = await normalizeLogo(await solid(64, 32));
  const smallMeta = await sharp(small).metadata();
  assert.deepEqual([smallMeta.format, smallMeta.width, smallMeta.height], ['png', 64, 32]);
  const big = await sharp(await normalizeLogo(await solid(1600, 800, 'jpeg'))).metadata();
  assert.deepEqual([big.format, big.width, big.height], ['png', 512, 256]);
  const webp = await sharp(await normalizeLogo(await solid(100, 100, 'webp'))).metadata();
  assert.equal(webp.format, 'png');

  const tagged = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } })
    .withExif({ IFD0: { Copyright: 'Jordan Example, 12 Private Street' } }).jpeg().toBuffer();
  const cleaned = await normalizeLogo(tagged);
  assert.equal((await sharp(cleaned).metadata()).exif, undefined);
  assert.equal(cleaned.includes('Private Street'), false);
});

test('anything that is not a small static PNG, JPEG or WebP is refused', async () => {
  const frame = color => sharp({ create: { width: 16, height: 16, channels: 4, background: color } }).png().toBuffer();
  const animated = await sharp([await frame('red'), await frame('blue')], { join: { animated: true } }).webp({ loop: 0 }).toBuffer();
  const refusals = {
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" width="10" height="10"/>'),
    'fake png': Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('<script>alert(1)</script>')]),
    'html': Buffer.from('<!doctype html><script>alert(1)</script>'),
    gif: await solid(10, 10, 'gif'),
    'too wide': await solid(3000, 10),
    'too many pixels': await solid(2049, 2049),
    animated,
    empty: Buffer.alloc(0),
  };
  for (const [name, buffer] of Object.entries(refusals))
    await assert.rejects(normalizeLogo(buffer), code('INVALID_LOGO'), name);
  await assert.rejects(normalizeLogo(Buffer.alloc(1024 * 1024 + 1, 1)), code('LOGO_TOO_LARGE'));
});

test('the logo endpoints: owner uploads, anyone views, nothing executable gets through', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const { api: member } = await joinTeam(server, owner, { username: 'mina' });
  const png = await solid(40, 40);
  const upload = (api, body, type = 'image/png') => api.request('PUT', '/api/org/logo', body, { 'content-type': type });

  assert.equal((await upload(member, png)).status, 403);
  const svg = await upload(owner, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml');
  assert.equal(svg.status, 415);
  const disguised = await upload(owner, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png');
  assert.equal(disguised.status, 422);
  assert.equal(disguised.body.error.code, 'INVALID_LOGO');
  assert.equal((await upload(owner, Buffer.alloc(1024 * 1024 + 10, 1))).status, 413);

  assert.equal((await upload(owner, png)).status, 204);
  const visitor = client(server.base);
  const session = await visitor.bootstrap();
  assert.equal(session.body.org.hasLogo, true);
  const logo = await fetch(`${server.base}/api/org/logo`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.equal(logo.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await sharp(Buffer.from(await logo.arrayBuffer())).metadata()).format, 'png');

  assert.equal((await member.request('DELETE', '/api/org/logo')).status, 403);
  assert.equal((await owner.request('DELETE', '/api/org/logo')).status, 204);
  assert.equal((await fetch(`${server.base}/api/org/logo`)).status, 404);
  const actions = server.db.prepare(`SELECT action FROM audit WHERE action LIKE 'org.logo%' ORDER BY created_at, rowid`).all();
  assert.deepEqual(actions.map(row => row.action), ['org.logo_update', 'org.logo_remove']);
});

test('settings and exports over HTTP follow the same roles', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const { api: admin } = await joinTeam(server, owner, { username: 'ada', role: 'admin' });
  const { api: member } = await joinTeam(server, owner, { username: 'max' });
  assert.equal((await member.request('PATCH', '/api/org', { name: 'Mine now' })).status, 403);
  assert.equal((await admin.request('PATCH', '/api/org', { name: 'Admin rename' })).status, 403);
  const renamed = await owner.request('PATCH', '/api/org', { name: 'Corner Café', feedbackUrl: 'https://forms.example.com/x' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.name, 'Corner Café');
  assert.equal((await member.request('GET', '/api/admin/ledger.csv')).status, 403);
  const csv = await admin.request('GET', '/api/admin/ledger.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /^text\/csv; charset=utf-8/);
  assert.equal(csv.headers.get('content-disposition'), 'attachment; filename="crumb-ledger.csv"');
});

test('a contact address that cannot be decoded is refused, not a server error', t => {
  const { db, owner } = fixture(t);
  for (const adminContact of ['mailto:%E0%A4%A', 'mailto:%zz@example.com'])
    assert.throws(() => updateOrg(db, owner, { adminContact }), code('INVALID_INPUT'), adminContact);
});
