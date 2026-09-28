import express from 'express';
import { AppError } from '../errors.mjs';
import { balanceOf } from '../balance.mjs';
import { collectionOf, nextSpriteKey, theme } from '../collections.mjs';
import { entryView } from '../ledger.mjs';
import { memberView } from '../members.mjs';
import { orgView, requireOrg } from '../org.mjs';
import { MANAGERS, requireActor, requireRole } from '../permissions.mjs';
import { REDEMPTION_COLUMNS, redemptionView } from '../redemptions.mjs';
import { isUuid } from '../validate.mjs';

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STATUSES = ['pending', 'completed', 'cancelled', 'rejected'];
const MEMBER_STATUSES = ['active', 'invited', 'deactivated'];
const KINDS = ['grant', 'revoke', 'redeem', 'refund'];

/* Query strings are read as strictly as bodies: unknown or repeated names are refused. */
export function readQuery(query, allowed) {
  for (const name of Object.keys(query)) {
    if (!allowed.includes(name)) throw new AppError(422, 'UNKNOWN_FIELD', `Unknown query parameter: ${name}.`, { field: name });
    if (typeof query[name] !== 'string') throw new AppError(422, 'INVALID_INPUT', `${name} can only be given once.`, { field: name });
  }
  return query;
}

function readChoice(value, choices, name) {
  if (value === undefined) return null;
  if (!choices.includes(value)) throw new AppError(422, 'INVALID_INPUT', `${name} must be one of: ${choices.join(', ')}.`, { field: name });
  return value;
}

/* Pages are keyset pages over (created_at, id), newest first. The cursor is
 * the last row's pair, checked for shape before it is used as a bound value. */
export function readPage(query) {
  let limit = 25;
  if (query.limit !== undefined) {
    limit = /^\d{1,3}$/.test(query.limit) ? Number(query.limit) : 0;
    if (limit < 1 || limit > 100) throw new AppError(422, 'INVALID_LIMIT', 'limit must be between 1 and 100.', { field: 'limit' });
  }
  let afterAt = null;
  let afterId = null;
  if (query.cursor !== undefined) {
    let decoded = null;
    try {
      decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
    } catch {
      decoded = null;
    }
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== 'string' || !ISO_TIME.test(decoded[0]) || !isUuid(decoded[1]))
      throw new AppError(422, 'INVALID_CURSOR', 'That page cursor is not valid.', { field: 'cursor' });
    [afterAt, afterId] = decoded;
  }
  return { take: limit + 1, limit, afterAt, afterId };
}

const encodeCursor = row => Buffer.from(JSON.stringify([row.created_at, row.id])).toString('base64url');

function pageOf(rows, limit, toItem) {
  const more = rows.length > limit;
  const kept = more ? rows.slice(0, limit) : rows;
  return { items: kept.map(toItem), nextCursor: more ? encodeCursor(kept.at(-1)) : null };
}

/* `alias` is always a literal from this file, never request input. */
const after = alias => `(@afterAt IS NULL OR ${alias}.created_at < @afterAt OR (${alias}.created_at = @afterAt AND ${alias}.id < @afterId))`;
const newestFirst = alias => `ORDER BY ${alias}.created_at DESC, ${alias}.id DESC LIMIT @take`;

const REVOKED = `(l.kind = 'grant' AND EXISTS (SELECT 1 FROM ledger r WHERE r.kind = 'revoke' AND r.source_id = l.id))`;

const historyItem = row => ({
  ...entryView(row),
  actorName: row.actor_name,
  revoked: row.revoked === 1,
  rewardName: row.reward_name ?? null,
});

export function readModelRoutes({ db }) {
  const router = express.Router();

  /* Everything a member's own screen needs, read from one snapshot. */
  router.get('/me', (req, res) => {
    const actor = requireActor(req.actor);
    readQuery(req.query, []);
    res.json(db.transaction(() => {
      const collection = collectionOf(db, actor.id).map(item => ({ ...item, names: theme.names[item.spriteKey] ?? null }));
      const next = nextSpriteKey(db, actor.id);
      return {
        user: req.session.user,
        org: orgView(requireOrg(db), { signedIn: true }),
        balance: balanceOf(db, actor.id),
        collection,
        theme: {
          id: theme.themeId,
          version: theme.version,
          size: theme.keys.length,
          complete: next === null,
          next: next ? { spriteKey: next, names: theme.names[next] } : null,
        },
      };
    })());
  });

  router.get('/me/ledger', (req, res) => {
    const actor = requireActor(req.actor);
    const page = readPage(readQuery(req.query, ['limit', 'cursor']));
    const rows = db.prepare(`SELECT l.*, a.display_name AS actor_name, ${REVOKED} AS revoked, rd.reward_name
      FROM ledger l
      LEFT JOIN users a ON a.id = l.actor_id
      LEFT JOIN redemptions rd ON rd.id = l.source_id AND l.kind IN ('redeem', 'refund')
      WHERE l.user_id = @userId AND ${after('l')} ${newestFirst('l')}`).all({ ...page, userId: actor.id });
    res.json(pageOf(rows, page.limit, historyItem));
  });

  router.get('/me/redemptions', (req, res) => {
    const actor = requireActor(req.actor);
    const page = readPage(readQuery(req.query, ['limit', 'cursor']));
    const rows = db.prepare(`SELECT ${REDEMPTION_COLUMNS} FROM redemptions r
      WHERE r.user_id = @userId AND ${after('r')} ${newestFirst('r')}`).all({ ...page, userId: actor.id });
    res.json(pageOf(rows, page.limit, redemptionView));
  });

  router.get('/admin/members', (req, res) => {
    requireRole(req.actor, MANAGERS);
    const query = readQuery(req.query, ['limit', 'cursor', 'status']);
    const page = readPage(query);
    const status = readChoice(query.status, MEMBER_STATUSES, 'status');
    const rows = db.prepare(`SELECT u.id, u.username, u.display_name, u.role, u.active, u.deactivated_at, u.created_at,
        (SELECT COALESCE(SUM(delta_units), 0) FROM ledger WHERE user_id = u.id) AS posted,
        (SELECT COALESCE(SUM(cost_units), 0) FROM redemptions WHERE user_id = u.id AND status = 'pending') AS reserved,
        (SELECT COALESCE(SUM(delta_units), 0) FROM ledger WHERE user_id = u.id AND kind IN ('grant', 'revoke')) AS lifetime
      FROM users u
      WHERE (@status IS NULL
             OR (@status = 'active' AND u.active = 1)
             OR (@status = 'deactivated' AND u.deactivated_at IS NOT NULL)
             OR (@status = 'invited' AND u.active = 0 AND u.deactivated_at IS NULL))
        AND ${after('u')} ${newestFirst('u')}`).all({ ...page, status });
    res.json(pageOf(rows, page.limit, row => ({
      ...memberView(row),
      balance: { postedUnits: row.posted, reservedUnits: row.reserved, availableUnits: row.posted - row.reserved, lifetimeUnits: row.lifetime },
    })));
  });

  router.get('/admin/redemptions', (req, res) => {
    requireRole(req.actor, MANAGERS);
    const query = readQuery(req.query, ['limit', 'cursor', 'status']);
    const page = readPage(query);
    const status = readChoice(query.status, STATUSES, 'status');
    const rows = db.prepare(`SELECT ${REDEMPTION_COLUMNS}, u.display_name AS member_name, u.username AS member_username
      FROM redemptions r JOIN users u ON u.id = r.user_id
      WHERE (@status IS NULL OR r.status = @status) AND ${after('r')} ${newestFirst('r')}`).all({ ...page, status });
    res.json(pageOf(rows, page.limit, row => ({
      ...redemptionView(row),
      member: { id: row.user_id, displayName: row.member_name, username: row.member_username },
    })));
  });

  router.get('/admin/ledger', (req, res) => {
    requireRole(req.actor, MANAGERS);
    const query = readQuery(req.query, ['limit', 'cursor', 'userId', 'kind']);
    const page = readPage(query);
    if (query.userId !== undefined && !isUuid(query.userId))
      throw new AppError(422, 'INVALID_INPUT', 'userId is not a valid id.', { field: 'userId' });
    const kind = readChoice(query.kind, KINDS, 'kind');
    const rows = db.prepare(`SELECT l.*, m.display_name AS member_name, m.username AS member_username,
        a.display_name AS actor_name, ${REVOKED} AS revoked, rd.reward_name
      FROM ledger l
      JOIN users m ON m.id = l.user_id
      LEFT JOIN users a ON a.id = l.actor_id
      LEFT JOIN redemptions rd ON rd.id = l.source_id AND l.kind IN ('redeem', 'refund')
      WHERE (@userId IS NULL OR l.user_id = @userId) AND (@kind IS NULL OR l.kind = @kind)
        AND ${after('l')} ${newestFirst('l')}`).all({ ...page, userId: query.userId ?? null, kind });
    res.json(pageOf(rows, page.limit, row => ({
      ...historyItem(row),
      member: { id: row.user_id, displayName: row.member_name, username: row.member_username },
      actor: { id: row.actor_id, displayName: row.actor_name },
    })));
  });

  router.get('/admin/audit', (req, res) => {
    requireRole(req.actor, MANAGERS);
    const page = readPage(readQuery(req.query, ['limit', 'cursor']));
    const rows = db.prepare(`SELECT au.*, a.display_name AS actor_name FROM audit au
      LEFT JOIN users a ON a.id = au.actor_id
      WHERE ${after('au')} ${newestFirst('au')}`).all(page);
    res.json(pageOf(rows, page.limit, row => ({
      id: row.id,
      action: row.action,
      targetId: row.target_id,
      detail: JSON.parse(row.detail_json),
      createdAt: row.created_at,
      actor: row.actor_id ? { id: row.actor_id, displayName: row.actor_name } : null,
    })));
  });

  return router;
}
