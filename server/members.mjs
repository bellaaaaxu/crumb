import { randomUUID } from 'node:crypto';
import { AppError } from './errors.mjs';
import { writeTransaction } from './db.mjs';
import { writeAudit } from './audit.mjs';
import { looksLikeSecret, newSecret, revokeSessionsOf, sha256 } from './auth.mjs';
import { MANAGERS, canManageRole, freshActor, requireRole } from './permissions.mjs';
import { bool, invalid, isUuid, oneOf, readObject, text, username } from './validate.mjs';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
export const ROLES = ['owner', 'admin', 'member'];

const iso = ms => new Date(ms).toISOString();
const notFound = () => new AppError(404, 'MEMBER_NOT_FOUND', 'That team member does not exist.');
const invalidLink = () => new AppError(400, 'INVALID_TOKEN',
  'This link is invalid, has expired or was already used. Ask your team admin for a new one.');
const forbidden = message => new AppError(403, 'FORBIDDEN', message);

export const statusOf = row => (row.active === 1 ? 'active' : row.deactivated_at ? 'deactivated' : 'invited');

export const memberView = row => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  status: statusOf(row),
  createdAt: row.created_at,
  deactivatedAt: row.deactivated_at,
});

function loadUser(db, userId) {
  if (!isUuid(userId)) throw notFound();
  const row = db.prepare(`SELECT id, username, display_name, role, active, deactivated_at, created_at,
                                 password_hash IS NOT NULL AS has_password
                          FROM users WHERE id = ?`).get(userId);
  if (!row) throw notFound();
  return row;
}

/* A new link of a kind replaces any unused one: only the latest link works. */
function issueToken(db, userId, purpose, ttlMs, now, issuerId) {
  db.prepare('UPDATE tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL').run(iso(now), userId, purpose);
  const token = newSecret();
  db.prepare('INSERT INTO tokens (token_hash, purpose, user_id, issued_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256(token), purpose, userId, issuerId, iso(now), iso(now + ttlMs));
  return token;
}

const voidLinksFor = (db, userId, now) =>
  db.prepare('UPDATE tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now, userId);

/* Someone deactivated (role null) or demoted: the unused links they made for
 * accounts they may no longer manage end for good, even if they come back. */
function voidLinksIssuedBy(db, issuerId, role, now) {
  const links = db.prepare(`SELECT t.token_hash, u.role FROM tokens t JOIN users u ON u.id = t.user_id
                            WHERE t.issued_by = ? AND t.used_at IS NULL`).all(issuerId);
  const end = db.prepare('UPDATE tokens SET used_at = ? WHERE token_hash = ?');
  for (const link of links) if (!role || !canManageRole({ role }, link.role)) end.run(now, link.token_hash);
}

/**
 * The one test of whether a link may be used right now: unused, not expired,
 * made by someone who is still active and may manage the account as it is
 * now, and for an account in the state the link expects. The routes run it
 * before spending a password hash; consumeToken runs it again when claiming.
 */
function usableLink(db, hash, purpose, now) {
  const link = db.prepare(`SELECT user_id, issued_by FROM tokens
                           WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`).get(hash, purpose, now);
  if (!link) return null;
  const user = loadUser(db, link.user_id);
  const issuer = db.prepare('SELECT role, active FROM users WHERE id = ?').get(link.issued_by);
  if (!issuer || issuer.active !== 1 || !canManageRole({ role: issuer.role }, user.role)) return null;
  const expected = purpose === 'invite' ? statusOf(user) === 'invited' && !user.has_password : user.active === 1;
  return expected ? user : null;
}

export function inviteMember(db, actor, input, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  const fields = readObject(input, {
    username: username(),
    displayName: text({ min: 1, max: 80 }),
    role: oneOf(ROLES),
  });
  return writeTransaction(db, () => {
    const current = freshActor(db, actor, MANAGERS);
    if (!canManageRole(current, fields.role)) throw forbidden('Admins can invite members only.');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(fields.username))
      throw new AppError(409, 'USERNAME_TAKEN', 'That username is already in use.', { field: 'username' });
    const now = clock();
    const id = randomUUID();
    db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, created_at)
                VALUES (?, ?, ?, NULL, ?, 0, ?)`).run(id, fields.username, fields.displayName, fields.role, iso(now));
    const token = issueToken(db, id, 'invite', INVITE_TTL_MS, now, current.id);
    writeAudit(db, { actorId: current.id, action: 'member.invite', targetId: id, detail: { role: fields.role } }, iso(now));
    return { user: memberView(loadUser(db, id)), token };
  });
}

/* For an invitation that expired or was lost; usernames are unique, so re-inviting is not possible. */
export function renewInvitation(db, actor, userId, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  return writeTransaction(db, () => {
    const current = freshActor(db, actor, MANAGERS);
    const target = loadUser(db, userId);
    if (!canManageRole(current, target.role)) throw forbidden('You cannot manage this account.');
    if (statusOf(target) !== 'invited') throw new AppError(409, 'NOT_INVITED', 'This account is not waiting on an invitation.');
    const now = clock();
    const token = issueToken(db, target.id, 'invite', INVITE_TTL_MS, now, current.id);
    writeAudit(db, { actorId: current.id, action: 'member.invite_renewed', targetId: target.id }, iso(now));
    return { token };
  });
}

export function issueReset(db, actor, userId, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  return writeTransaction(db, () => {
    const current = freshActor(db, actor, MANAGERS);
    const target = loadUser(db, userId);
    if (!canManageRole(current, target.role)) throw forbidden('You cannot reset this account.');
    const status = statusOf(target);
    if (status === 'invited')
      throw new AppError(409, 'INVITATION_PENDING', 'This person has not joined yet. Send them a new invitation link instead.');
    if (status === 'deactivated')
      throw new AppError(409, 'MEMBER_INACTIVE', 'Reactivate this account before resetting its password.');
    const now = clock();
    const token = issueToken(db, target.id, 'reset', RESET_TTL_MS, now, current.id);
    writeAudit(db, { actorId: current.id, action: 'member.reset_issued', targetId: target.id }, iso(now));
    return { token };
  });
}

/* Cheap check before spending a password hash: the same test consumeToken makes. */
export function checkToken(db, { token, purpose }, clock = () => Date.now()) {
  if (!looksLikeSecret(token)) return false;
  return usableLink(db, sha256(token), purpose, iso(clock())) !== null;
}

/**
 * Uses a one-time link. The password was hashed beforehand (outside the
 * transaction); here the link is checked and claimed in one IMMEDIATE
 * transaction, so two simultaneous submissions cannot both succeed. A link is
 * only as good as the person who made it (see usableLink): otherwise an admin
 * could keep a link to an account an owner later promoted, or a removed admin
 * could still use links they handed out. A reset never brings back a
 * deactivated account. Every session of the account ends.
 */
export function consumeToken(db, { token, passwordHash, purpose }, clock = () => Date.now()) {
  if (!looksLikeSecret(token) || !['invite', 'reset'].includes(purpose)) throw invalidLink();
  return writeTransaction(db, () => {
    const now = iso(clock());
    const hash = sha256(token);
    const user = usableLink(db, hash, purpose, now);
    if (!user) throw invalidLink();
    db.prepare('UPDATE tokens SET used_at = ? WHERE token_hash = ?').run(now, hash);
    if (purpose === 'invite') db.prepare('UPDATE users SET password_hash = ?, active = 1 WHERE id = ?').run(passwordHash, user.id);
    else db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
    revokeSessionsOf(db, user.id);
    writeAudit(db, { actorId: user.id, action: purpose === 'invite' ? 'member.joined' : 'member.password_reset', targetId: user.id }, now);
    return { username: user.username };
  });
}

/* Inside the caller's transaction: the person loses access at once, links for
 * them and links they made stop working, and anything they asked for is
 * released. History stays. */
function deactivate(db, actor, target, now) {
  db.prepare('UPDATE users SET active = 0, deactivated_at = ? WHERE id = ?').run(now, target.id);
  revokeSessionsOf(db, target.id);
  voidLinksFor(db, target.id, now);
  voidLinksIssuedBy(db, target.id, null, now);
  const pending = db.prepare(`SELECT id, reward_name, cost_units FROM redemptions WHERE user_id = ? AND status = 'pending'`).all(target.id);
  const cancel = db.prepare(`UPDATE redemptions SET status = 'cancelled', resolved_at = ?, resolved_by = ?,
                               resolution_reason = 'Account deactivated' WHERE id = ? AND status = 'pending'`);
  for (const request of pending) {
    cancel.run(now, actor.id, request.id);
    writeAudit(db, { actorId: actor.id, action: 'redemption.cancel', targetId: request.id,
      detail: { reason: 'member_deactivated', userId: target.id, costUnits: request.cost_units } }, now);
  }
  writeAudit(db, { actorId: actor.id, action: 'member.deactivate', targetId: target.id,
    detail: { cancelledRequests: pending.length } }, now);
}

export function updateMember(db, actor, userId, changes, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  const patch = readObject(changes, { role: oneOf(ROLES, { optional: true }), active: bool({ optional: true }) });
  if (patch.role === undefined && patch.active === undefined) throw invalid('active', 'Nothing to change.');
  return writeTransaction(db, () => {
    const current = freshActor(db, actor, MANAGERS);
    const target = loadUser(db, userId);
    if (!canManageRole(current, target.role)) throw forbidden('You cannot manage this account.');
    const nextRole = patch.role ?? target.role;
    if (nextRole !== target.role && current.role !== 'owner') throw forbidden('Only an owner can change roles.');

    const status = statusOf(target);
    const deactivating = patch.active === false && status !== 'deactivated';
    const reactivating = patch.active === true && status === 'deactivated';
    if (target.role === 'owner' && target.active === 1 && (nextRole !== 'owner' || deactivating)) {
      const owners = db.prepare(`SELECT count(*) AS n FROM users WHERE role = 'owner' AND active = 1`).get().n;
      if (owners <= 1)
        throw new AppError(409, 'LAST_OWNER', 'The last active owner cannot be removed or demoted. Make someone else an owner first.');
    }

    const now = iso(clock());
    if (nextRole !== target.role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(nextRole, target.id);
      // Links made for the old role end; a new one must come from someone who may manage the new role.
      voidLinksFor(db, target.id, now);
      // And links this person made that the new role could not have made end too.
      voidLinksIssuedBy(db, target.id, nextRole, now);
      writeAudit(db, { actorId: current.id, action: 'member.role', targetId: target.id, detail: { from: target.role, to: nextRole } }, now);
    }
    if (deactivating) deactivate(db, current, target, now);
    if (reactivating) {
      // Someone who never finished joining goes back to "invited" and needs a new link.
      db.prepare(`UPDATE users SET deactivated_at = NULL,
                    active = CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END WHERE id = ?`).run(target.id);
      writeAudit(db, { actorId: current.id, action: 'member.reactivate', targetId: target.id }, now);
    }
    return memberView(loadUser(db, target.id));
  });
}
