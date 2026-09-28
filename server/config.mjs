import { join, resolve } from 'node:path';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function configError(message) {
  return Object.assign(new Error(message), { code: 'CONFIG' });
}

function readBoolean(value, name) {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw configError(`${name} must be "true" or "false".`);
}

function readOrigin(value, allowLocalHttp) {
  if (!value) throw configError('PUBLIC_ORIGIN is required, for example https://crumb.example.com.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw configError(`PUBLIC_ORIGIN "${value}" is not a URL. Use the address people type, e.g. https://crumb.example.com.`);
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || value.includes('?') || value.includes('#'))
    throw configError('PUBLIC_ORIGIN must be just the scheme and host, with no path, query or credentials.');
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:') {
    if (allowLocalHttp && LOCAL_HOSTS.has(url.hostname)) return url.origin;
    throw configError('PUBLIC_ORIGIN must use https://. Plain http:// is only allowed for localhost or 127.0.0.1 with ALLOW_LOCAL_HTTP=true.');
  }
  throw configError('PUBLIC_ORIGIN must start with https://.');
}

function readPort(value) {
  if (!/^\d{1,5}$/.test(value)) throw configError('PORT must be a whole number between 1 and 65535.');
  const port = Number(value);
  if (port < 1 || port > 65535) throw configError('PORT must be a whole number between 1 and 65535.');
  return port;
}

/* Only "no proxy" or "exactly one proxy in front of Crumb" are supported. */
function readTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false' || value === '0') return false;
  if (value === 'true' || value === '1') return 1;
  throw configError('TRUST_PROXY must be "false" or "1" (one reverse proxy in front of Crumb).');
}

export function loadConfig(env = process.env) {
  const allowLocalHttp = readBoolean(env.ALLOW_LOCAL_HTTP, 'ALLOW_LOCAL_HTTP');
  const publicOrigin = readOrigin(env.PUBLIC_ORIGIN, allowLocalHttp);
  const dataDir = resolve(env.DATA_DIR || 'data');
  return {
    publicOrigin,
    secureCookies: publicOrigin.startsWith('https:'),
    allowLocalHttp,
    dataDir,
    dbPath: join(dataDir, 'crumb.sqlite'),
    port: readPort(env.PORT ?? '3000'),
    host: env.HOST || '127.0.0.1',
    trustProxy: readTrustProxy(env.TRUST_PROXY),
    setupTokenFile: resolve(env.SETUP_TOKEN_FILE || join('.secrets', 'setup-token')),
  };
}
