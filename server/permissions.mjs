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

/* Owners manage everyone; admins manage ordinary members only. */
export function canManageRole(actor, targetRole) {
  if (actor?.role === 'owner') return true;
  return actor?.role === 'admin' && targetRole === 'member';
}
