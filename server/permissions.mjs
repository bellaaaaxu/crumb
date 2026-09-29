import { AppError } from './errors.mjs';

export const MANAGERS = ['owner', 'admin'];

/* The actor always comes from the verified session, never from a request body. */
export function requireActor(actor) {
  if (!actor) throw new AppError(401, 'SIGN_IN_REQUIRED', 'Please sign in.');
  return actor;
}

export function requireRole(actor, roles) {
  requireActor(actor);
  if (!roles.includes(actor.role)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
  return actor;
}

/**
 * Re-reads the actor inside a write transaction. The session said who they
 * were a moment ago; this makes sure they are still active and still hold a
 * permitted role at the instant the change is made.
 */
export function freshActor(db, actor, roles) {
  requireActor(actor);
  const row = db.prepare('SELECT role, active FROM users WHERE id = ?').get(actor.id);
  if (!row || row.active !== 1) throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is no longer active.');
  if (roles && !roles.includes(row.role)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
  return { id: actor.id, role: row.role };
}

/* Owners manage everyone; admins manage ordinary members only. */
export function canManageRole(actor, targetRole) {
  if (actor?.role === 'owner') return true;
  return actor?.role === 'admin' && targetRole === 'member';
}
