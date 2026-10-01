import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { AppError } from '../errors.mjs';
import { writeTransaction } from '../db.mjs';
import { writeAudit } from '../audit.mjs';
import { DUMMY_HASH, hashPassword, isPasswordHash, verifyPassword } from '../passwords.mjs';
import {
  clearSessionCookie, createSession, deleteSession, loginBuckets, refundLoginAttempt, releaseLoginAttempt,
  reserveLoginAttempt, sameHash, setSessionCookie, sha256, toSessionUser,
} from '../auth.mjs';
import { orgView, readNewOrg, readOrgRow } from '../org.mjs';
import { object, readObject, secret, text, username } from '../validate.mjs';
import { readQuery } from './read-models.mjs';

const INVALID_CREDENTIALS = () => new AppError(401, 'INVALID_CREDENTIALS', 'That username and password do not match.');
/* Shown in the footer, so a bug report can say which Crumb it is about. */
const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

/* The setup code is written by scripts/init-secrets.mjs and mounted read-only.
 * A missing or implausibly short file means setup is not available at all. */
async function readSetupToken(path) {
  try {
    const value = (await readFile(path, 'utf8')).trim();
    return value.length >= 32 ? value : null;
  } catch {
    return null;
  }
}

export function authRoutes({ db, config, clock }) {
  const router = express.Router();
  const iso = () => new Date(clock()).toISOString();

  /* Starts a short anonymous session when there is none, so sign-in, setup
   * and the invitation forms all have a CSRF token to send. */
  router.get('/session', (req, res) => {
    readQuery(req.query, []);
    let { session } = req;
    if (!session) {
      const created = createSession(db, null, clock);
      setSessionCookie(res, config, created);
      session = { user: null, csrfToken: created.csrfToken };
    }
    const row = readOrgRow(db);
    res.json({
      user: session.user,
      csrfToken: session.csrfToken,
      initialized: Boolean(row),
      org: orgView(row, { signedIn: Boolean(session.user) }),
      version: VERSION,
      // Changes are only accepted from this address; the page warns when it was opened elsewhere.
      origin: config.publicOrigin,
    });
  });

  router.post('/setup', async (req, res) => {
    const body = readObject(req.body, {
      setupToken: secret({ max: 512 }),
      username: username(),
      password: secret({ max: 1024 }),
      displayName: text({ min: 1, max: 80 }),
      org: object(),
    });
    const org = readNewOrg(body.org);
    if (readOrgRow(db)) throw new AppError(409, 'ALREADY_INITIALIZED', 'Crumb is already set up. Sign in instead.');

    const expected = await readSetupToken(config.setupTokenFile);
    if (!expected)
      throw new AppError(503, 'SETUP_UNAVAILABLE', 'The setup code file is missing on the server. See docs/DEPLOYMENT.md.');
    if (!sameHash(sha256(body.setupToken.trim()), sha256(expected)))
      throw new AppError(403, 'INVALID_SETUP_TOKEN', 'That setup code is not correct.', { field: 'setupToken' });

    const passwordHash = await hashPassword(body.password);
    const owner = { id: randomUUID(), username: body.username, display_name: body.displayName, role: 'owner' };
    const created = writeTransaction(db, () => {
      if (readOrgRow(db)) throw new AppError(409, 'ALREADY_INITIALIZED', 'Crumb is already set up. Sign in instead.');
      const now = iso();
      db.prepare(`INSERT INTO organization (id, name, mode, currency, unit_label, threshold_units, locale, welcome, spending, created_at)
                  VALUES (1, @name, @mode, @currency, @unitLabel, @thresholdUnits, @locale, @welcome, @spending, @now)`).run({ ...org, now });
      db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, joined_at, created_at)
                  VALUES (?, ?, ?, ?, 'owner', 1, ?, ?)`).run(owner.id, owner.username, owner.display_name, passwordHash, now, now);
      writeAudit(db, { actorId: owner.id, action: 'org.setup', targetId: owner.id,
        detail: { mode: org.mode, currency: org.currency, thresholdUnits: org.thresholdUnits } }, now);
      if (req.session) deleteSession(db, req.session.tokenHash);
      return createSession(db, owner.id, clock);
    });
    setSessionCookie(res, config, created);
    res.status(201).json({ user: toSessionUser(owner), csrfToken: created.csrfToken });
  });

  router.post('/login', async (req, res) => {
    const body = readObject(req.body, { username: secret({ max: 200 }), password: secret({ max: 1024 }) });
    const name = body.username.trim().toLowerCase();
    const buckets = loginBuckets(name, req.ip);
    reserveLoginAttempt(db, buckets, clock);

    const user = db.prepare('SELECT id, username, display_name, role, active, password_hash FROM users WHERE username = ?').get(name);
    let created;
    try {
      const usable = user?.active === 1 && isPasswordHash(user.password_hash);
      const matches = await verifyPassword(body.password, usable ? user.password_hash : DUMMY_HASH);
      if (!usable || !matches) throw INVALID_CREDENTIALS();
      created = writeTransaction(db, () => {
        // The password check was async: make sure nothing changed meanwhile.
        const fresh = db.prepare('SELECT active, password_hash FROM users WHERE id = ?').get(user.id);
        if (fresh?.active !== 1 || fresh.password_hash !== user.password_hash) throw INVALID_CREDENTIALS();
        if (req.session) deleteSession(db, req.session.tokenHash);
        return createSession(db, user.id, clock);
      });
    } catch (error) {
      // Only a wrong username or password counts. "Busy" was never a guess.
      if (error.code !== 'INVALID_CREDENTIALS') refundLoginAttempt(db, buckets);
      throw error;
    }
    releaseLoginAttempt(db, buckets);
    setSessionCookie(res, config, created);
    res.json({ user: toSessionUser(user), csrfToken: created.csrfToken });
  });

  router.post('/logout', (req, res) => {
    readObject(req.body ?? {}, {});
    if (req.session) deleteSession(db, req.session.tokenHash);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  return router;
}
