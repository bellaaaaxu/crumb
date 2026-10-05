import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeLogo, updateOrg } from '../server/org.mjs';
import { grant } from '../server/ledger.mjs';
import { updateMember } from '../server/members.mjs';
import { listRewards, saveReward } from '../server/rewards.mjs';
import { PASSWORD, client, fixture, joinTeam, orgInput, setupOrganization, startServer } from './helpers.mjs';

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
  assert.deepEqual(shown.locks, { mode: true, threshold: true, theme: true });
});

test('a priced catalog fixes the reward type and currency but not the threshold', t => {
  const { db, owner } = fixture(t);
  saveReward(db, owner, { name: 'Coffee', description: '', costUnits: 450, active: true });
  assert.throws(() => updateOrg(db, owner, { mode: 'points', threshold: '100' }), code('RULES_LOCKED'));
  assert.throws(() => updateOrg(db, owner, { currency: 'CNY' }), code('RULES_LOCKED'));
  const org = updateOrg(db, owner, { threshold: '40.00' });
  assert.equal(org.thresholdUnits, 4000);
  assert.deepEqual(org.locks, { mode: true, threshold: false, theme: false });
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

test('the spending mode defaults to self, and only an owner changes it, at any time', t => {
  const { db, owner, member } = fixture(t);
  assert.equal(updateOrg(db, owner, {}).spending, 'self');
  grant(db, owner, { userId: member.id, units: 500, reason: 'First one', key: 'spending-lock-grant-01' });
  assert.equal(updateOrg(db, owner, { spending: 'confirm' }).spending, 'confirm');
  assert.equal(updateOrg(db, owner, { spending: 'self' }).spending, 'self');
  assert.throws(() => updateOrg(db, owner, { spending: 'honour' }), code('INVALID_INPUT'));
  const admin = updateMember(db, owner, member.id, { role: 'admin' });
  assert.throws(() => updateOrg(db, { id: admin.id, role: 'admin' }, { spending: 'confirm' }), code('FORBIDDEN'));
  const audit = db.prepare(`SELECT detail_json FROM audit WHERE action = 'org.update' ORDER BY created_at DESC, rowid DESC LIMIT 1`).get();
  assert.deepEqual(JSON.parse(audit.detail_json).changed, ['spending']);
});

test('setup accepts a spending mode and the session reports it', async t => {
  const server = await startServer(t);
  const { api } = await setupOrganization(server, { org: { spending: 'confirm' } });
  const session = await api.request('GET', '/api/session');
  assert.equal(session.body.org.spending, 'confirm');
  const other = await startServer(t);
  const plain = await setupOrganization(other);
  assert.equal((await plain.api.request('GET', '/api/session')).body.org.spending, 'self');
});

test('setup takes a collection theme, Pastry shop when none is given, and records it', async t => {
  const setupDetail = server => JSON.parse(server.db.prepare(`SELECT detail_json FROM audit WHERE action = 'org.setup'`).get().detail_json);
  const storedTheme = server => server.db.prepare('SELECT theme FROM organization WHERE id = 1').get().theme;

  const plain = await startServer(t);
  await setupOrganization(plain);
  assert.equal(storedTheme(plain), 'default');
  assert.deepEqual(setupDetail(plain), { mode: 'credit', currency: 'CAD', thresholdUnits: 5000, theme: 'default' });

  const bakery = await startServer(t);
  await setupOrganization(bakery, { mode: 'points', org: { theme: 'bakery' } });
  assert.equal(storedTheme(bakery), 'bakery');
  assert.deepEqual(setupDetail(bakery), { mode: 'points', currency: null, thresholdUnits: 100, theme: 'bakery' });

  const unknown = await startServer(t);
  const api = client(unknown.base);
  await api.bootstrap();
  const refused = await api.request('POST', '/api/setup', {
    setupToken: unknown.setupToken, username: 'owner', password: PASSWORD, displayName: 'Olive',
    org: orgInput('credit', { theme: 'unicorn' }),
  });
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.field], [422, 'INVALID_INPUT', 'org.theme']);
  assert.equal(unknown.db.prepare('SELECT count(*) AS n FROM organization').get().n, 0);
});

test('the session carries the team theme signed in and signed out, and the first treat sets locks.theme', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server, { org: { theme: 'bakery' } });
  const { api: member, user: mina } = await joinTeam(server, owner, { username: 'mina' });
  const org = async api => (await api.request('GET', '/api/session')).body.org;

  const signedIn = await org(owner);
  assert.deepEqual([signedIn.theme, signedIn.locks], ['bakery', { mode: false, threshold: false, theme: false }]);
  assert.equal((await org(member)).theme, 'bakery');
  const visitor = await client(server.base).bootstrap();
  assert.deepEqual(visitor.body.org, { name: 'Test Team', locale: 'en', hasLogo: false, theme: 'bakery' });

  const treat = await owner.request('POST', '/api/admin/grants',
    { userId: mina.id, amount: '5.00', mode: 'credit', reason: 'Thanks' }, { 'idempotency-key': 'org-theme-session-grant-01' });
  assert.equal(treat.status, 201);
  assert.deepEqual((await org(owner)).locks, { mode: true, threshold: true, theme: true });
});

test('the collection theme is fixed with the unlock step: only an owner changes it, until the first treat', t => {
  const { db, owner, member, member2 } = fixture(t);
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(member2.id);
  assert.throws(() => updateOrg(db, { id: member2.id, role: 'admin' }, { theme: 'bakery' }), code('FORBIDDEN'));
  assert.throws(() => updateOrg(db, member, { theme: 'bakery' }), code('FORBIDDEN'));
  for (const theme of ['unicorn', '', 'Bakery', 5])
    assert.throws(() => updateOrg(db, owner, { theme }), code('INVALID_INPUT'), JSON.stringify(theme));

  // Priced benefits fix the unit, not the theme.
  saveReward(db, owner, { name: 'Coffee', description: '', costUnits: 450, active: true });
  const bakery = updateOrg(db, owner, { theme: 'bakery' });
  assert.deepEqual([bakery.theme, bakery.locks], ['bakery', { mode: true, threshold: false, theme: false }]);

  grant(db, owner, { userId: member.id, units: 500, reason: 'First one', key: 'theme-lock-grant-01' });
  assert.throws(() => updateOrg(db, owner, { theme: 'default' }), code('RULES_LOCKED'));
  assert.equal(db.prepare('SELECT theme FROM organization WHERE id = 1').get().theme, 'bakery');
  // Restating the current theme is not a change, so a form that always sends it still saves.
  const restated = updateOrg(db, owner, { theme: 'bakery', name: 'Corner Bakery' });
  assert.deepEqual([restated.name, restated.theme, restated.iconsRemoved], ['Corner Bakery', 'bakery', 0]);
  assert.deepEqual(restated.locks, { mode: true, threshold: true, theme: true });
});

test('changing the theme removes the benefit icons it does not draw, active or not, and keeps shared ones', t => {
  const { db, owner } = fixture(t);
  const tart = saveReward(db, owner, { name: 'Egg tart run', description: '', costUnits: 300, active: true, iconKey: 'tart' });
  const bun = saveReward(db, owner, { name: 'Pineapple bun', description: '', costUnits: 400, active: true, iconKey: 'bolo' });
  const lunch = saveReward(db, owner, { name: 'Lunch', description: '', costUnits: 1400, active: true });
  const icons = () => Object.fromEntries(listRewards(db, { includeInactive: true }).map(reward => [reward.id, reward.iconKey]));
  const lastUpdate = () => JSON.parse(db.prepare(
    `SELECT detail_json FROM audit WHERE action = 'org.update' ORDER BY created_at DESC, rowid DESC LIMIT 1`).get().detail_json);

  const toBakery = updateOrg(db, owner, { theme: 'bakery' });
  assert.deepEqual([toBakery.theme, toBakery.iconsRemoved], ['bakery', 1]);
  assert.deepEqual(icons(), { [tart.id]: null, [bun.id]: 'bolo', [lunch.id]: null });
  assert.deepEqual(lastUpdate(), { changed: ['theme'], theme: { from: 'default', to: 'bakery' }, iconsRemoved: 1 });

  // Back again with another change: the shared icon is in both themes, so nothing goes, and the row says 0.
  const back = updateOrg(db, owner, { theme: 'default', name: 'Corner Café' });
  assert.deepEqual([back.theme, back.name, back.iconsRemoved], ['default', 'Corner Café', 0]);
  assert.deepEqual(lastUpdate(), { changed: ['name', 'theme'], theme: { from: 'bakery', to: 'default' }, iconsRemoved: 0 });

  // A benefit that is switched off loses an icon the new theme lacks too.
  const hidden = saveReward(db, owner, { name: 'Mooncake box', description: '', costUnits: 2000, active: false, iconKey: 'mooncake' });
  assert.equal(updateOrg(db, owner, { theme: 'bakery' }).iconsRemoved, 1);
  assert.deepEqual(icons(), { [tart.id]: null, [bun.id]: 'bolo', [lunch.id]: null, [hidden.id]: null });
});

test('a change that leaves the theme alone removes no icons and is audited as before', t => {
  const { db, owner } = fixture(t);
  const tart = saveReward(db, owner, { name: 'Egg tart run', description: '', costUnits: 300, active: true, iconKey: 'tart' });
  const updates = () => db.prepare(`SELECT detail_json FROM audit WHERE action = 'org.update' ORDER BY created_at, rowid`).all()
    .map(row => JSON.parse(row.detail_json));
  const renamed = updateOrg(db, owner, { name: 'Renamed' });
  assert.deepEqual([renamed.name, renamed.theme, renamed.iconsRemoved], ['Renamed', 'default', 0]);
  assert.deepEqual(updates(), [{ changed: ['name'] }]);
  assert.equal(updateOrg(db, owner, { theme: 'default' }).iconsRemoved, 0, 'the current theme again');
  assert.deepEqual(updates(), [{ changed: ['name'] }], 'nothing changed, so nothing is written');
  assert.equal(listRewards(db).find(reward => reward.id === tart.id).iconKey, 'tart');
});

test('over HTTP only an owner changes the theme, the answer counts the removed icons, and a treat fixes it', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const { api: admin } = await joinTeam(server, owner, { username: 'ada', role: 'admin' });
  const { user: mina } = await joinTeam(server, owner, { username: 'mina' });
  const added = await owner.request('POST', '/api/admin/rewards',
    { name: 'Egg tart run', description: '', amount: '3.00', mode: 'credit', active: true, iconKey: 'tart' },
    { 'idempotency-key': 'org-theme-benefit-000001' });
  assert.equal(added.status, 201);

  assert.equal((await admin.request('PATCH', '/api/org', { theme: 'bakery' })).status, 403);
  const changed = await owner.request('PATCH', '/api/org', { theme: 'bakery' });
  assert.deepEqual([changed.status, changed.body.theme, changed.body.iconsRemoved], [200, 'bakery', 1]);
  assert.deepEqual((await owner.request('GET', '/api/admin/rewards')).body.items.map(item => item.iconKey), [null]);
  const renamed = await owner.request('PATCH', '/api/org', { name: 'Corner Bakery' });
  assert.deepEqual([renamed.status, renamed.body.name, renamed.body.iconsRemoved], [200, 'Corner Bakery', 0]);
  const session = (await owner.request('GET', '/api/session')).body.org;
  assert.equal(session.theme, 'bakery');
  assert.equal(Object.hasOwn(session, 'iconsRemoved'), false, 'the count is only in the answer to the change');

  const treat = await owner.request('POST', '/api/admin/grants',
    { userId: mina.id, amount: '5.00', mode: 'credit', reason: 'Thanks' }, { 'idempotency-key': 'org-theme-grant-000001' });
  assert.equal(treat.status, 201);
  const locked = await owner.request('PATCH', '/api/org', { theme: 'default' });
  assert.deepEqual([locked.status, locked.body.error.code], [409, 'RULES_LOCKED']);
  assert.equal((await owner.request('GET', '/api/session')).body.org.theme, 'bakery');
});
