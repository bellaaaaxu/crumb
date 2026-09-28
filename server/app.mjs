import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { AppError } from './errors.mjs';
import { isBusy } from './db.mjs';
import { csrfMiddleware, sessionMiddleware } from './auth.mjs';
import { authRoutes } from './routes/auth.mjs';
import { memberRoutes } from './routes/members.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(root, 'app');
const ASSETS_DIR = join(root, 'assets');

function securityHeaders(config) {
  const directives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  };
  if (config.secureCookies) directives.upgradeInsecureRequests = [];
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: config.secureCookies ? { maxAge: 15552000, includeSubDomains: false } : false,
  });
}

/* Anything unexpected is logged by name and message only — never the request
 * body — and answered with a generic message. */
function errorHandler(log) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = 500;
    let body = { code: 'INTERNAL', message: 'Something went wrong on the server.' };
    if (error instanceof AppError) {
      status = error.status;
      body = { code: error.code, message: error.message };
      if (error.field) body.field = error.field;
      for (const [name, value] of Object.entries(error.headers ?? {})) res.set(name, value);
    } else if (error?.type === 'entity.parse.failed') {
      status = 400;
      body = { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' };
    } else if (error?.type === 'entity.too.large') {
      status = 413;
      body = { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' };
    } else if (isBusy(error)) {
      status = 503;
      body = { code: 'RETRY_LATER', message: 'Crumb is busy right now. Please try again.' };
    } else if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.expose) {
      status = error.status;
      body = { code: 'BAD_REQUEST', message: 'The request could not be understood.' };
    } else {
      log(`[crumb] ${req.method} ${req.path} failed: ${error?.name ?? 'Error'}: ${error?.message ?? error}`);
    }
    if (req.originalUrl.startsWith('/api/')) res.status(status).json({ error: body });
    else res.status(status).type('text/plain').send(body.message);
  };
}

export function createApp({ db, config, clock = () => Date.now(), log = console.error }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use(securityHeaders(config));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/healthz', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  const api = express.Router();
  api.use(express.json({ limit: '32kb' }));
  api.use(sessionMiddleware({ db, config, clock }));
  api.use(csrfMiddleware({ config }));
  api.use(authRoutes({ db, config, clock }));
  api.use(memberRoutes({ db, config, clock }));
  api.use(() => {
    throw new AppError(404, 'NOT_FOUND', 'Not found.');
  });
  app.use('/api', api);

  /* The product UI is app/ plus the shared sprite table — nothing else from the repository.
   * `root` matters: without it the dotfile rule is applied to the whole absolute
   * path, and an install under a directory like ~/.apps would stop serving it. */
  const fileOptions = { cacheControl: false, lastModified: false, dotfiles: 'ignore' };
  app.get('/assets/sprites.js', (req, res, next) =>
    res.sendFile('sprites.js', { ...fileOptions, root: ASSETS_DIR }, error => error && next(error)));
  app.use(express.static(APP_DIR, { ...fileOptions, index: 'index.html', redirect: false }));
  app.use((req, res) => res.status(404).type('text/plain').send('Not found.'));
  app.use(errorHandler(log));
  return app;
}
