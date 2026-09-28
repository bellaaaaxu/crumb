import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadConfig } from '../server/config.mjs';

const configError = error => error.code === 'CONFIG';

test('a public HTTPS origin gives secure cookies and safe defaults', () => {
  const config = loadConfig({ PUBLIC_ORIGIN: 'https://crumb.example.com' });
  assert.equal(config.publicOrigin, 'https://crumb.example.com');
  assert.equal(config.secureCookies, true);
  assert.equal(config.port, 3000);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.trustProxy, false);
  assert.equal(config.dataDir, resolve('data'));
  assert.equal(config.dbPath, resolve('data', 'crumb.sqlite'));
  assert.equal(config.setupTokenFile, resolve('.secrets', 'setup-token'));
});

test('the origin is required and must be an origin, not a page', () => {
  assert.throws(() => loadConfig({}), configError);
  assert.equal(loadConfig({ PUBLIC_ORIGIN: 'https://crumb.example.com/' }).publicOrigin, 'https://crumb.example.com');
  for (const value of ['crumb.example.com', 'https://crumb.example.com/app', 'https://crumb.example.com/?x=1',
    'https://user:pw@crumb.example.com', 'ftp://crumb.example.com', 'https://crumb.example.com/#top'])
    assert.throws(() => loadConfig({ PUBLIC_ORIGIN: value }), configError, value);
});

test('plain HTTP is only for this machine, and only when asked for', () => {
  assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'http://localhost:3000' }), configError);
  assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'http://crumb.example.com', ALLOW_LOCAL_HTTP: 'true' }), configError);
  assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'http://192.168.1.20:3000', ALLOW_LOCAL_HTTP: 'true' }), configError);
  const local = loadConfig({ PUBLIC_ORIGIN: 'http://localhost:3000', ALLOW_LOCAL_HTTP: 'true' });
  assert.equal(local.publicOrigin, 'http://localhost:3000');
  assert.equal(local.secureCookies, false);
  assert.equal(loadConfig({ PUBLIC_ORIGIN: 'http://127.0.0.1:3000', ALLOW_LOCAL_HTTP: 'true' }).publicOrigin, 'http://127.0.0.1:3000');
  assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'http://localhost:3000', ALLOW_LOCAL_HTTP: 'yes' }), configError);
});

test('ports, proxy trust and paths are validated', () => {
  const base = { PUBLIC_ORIGIN: 'https://crumb.example.com' };
  assert.equal(loadConfig({ ...base, PORT: '8080' }).port, 8080);
  for (const port of ['0', '65536', 'abc', '80.5', ''])
    assert.throws(() => loadConfig({ ...base, PORT: port }), configError, port);
  assert.equal(loadConfig({ ...base, TRUST_PROXY: '1' }).trustProxy, 1);
  assert.equal(loadConfig({ ...base, TRUST_PROXY: 'false' }).trustProxy, false);
  assert.throws(() => loadConfig({ ...base, TRUST_PROXY: '2' }), configError);
  assert.throws(() => loadConfig({ ...base, TRUST_PROXY: 'loopback' }), configError);
  const custom = loadConfig({ ...base, DATA_DIR: '/data', SETUP_TOKEN_FILE: '/run/secrets/setup_token', HOST: '0.0.0.0' });
  assert.equal(custom.dbPath, resolve('/data', 'crumb.sqlite'));
  assert.equal(custom.setupTokenFile, resolve('/run/secrets/setup_token'));
  assert.equal(custom.host, '0.0.0.0');
});
