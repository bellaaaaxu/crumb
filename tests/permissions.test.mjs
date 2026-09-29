import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageRole, requireActor, requireRole } from '../server/permissions.mjs';

test('a member cannot administer the organization', () => {
  assert.throws(() => requireRole({id:'m',role:'member'}, ['owner','admin']),
    error => error.status === 403);
});

test('signed-out requests are told to sign in, not that they lack a role', () => {
  assert.throws(() => requireRole(null, ['owner']), error => error.status === 401 && error.code === 'SIGN_IN_REQUIRED');
  assert.throws(() => requireActor(undefined), error => error.status === 401);
});

test('owners and admins pass the manager check with their own role', () => {
  assert.doesNotThrow(() => requireRole({ id: 'o', role: 'owner' }, ['owner', 'admin']));
  assert.doesNotThrow(() => requireRole({ id: 'a', role: 'admin' }, ['owner', 'admin']));
  assert.throws(() => requireRole({ id: 'a', role: 'admin' }, ['owner']), error => error.status === 403);
});

test('admins manage members only; owners manage everyone', () => {
  const owner = { id: 'o', role: 'owner' };
  const admin = { id: 'a', role: 'admin' };
  const member = { id: 'm', role: 'member' };
  assert.equal(canManageRole(owner, 'owner'), true);
  assert.equal(canManageRole(owner, 'admin'), true);
  assert.equal(canManageRole(owner, 'member'), true);
  assert.equal(canManageRole(admin, 'member'), true);
  assert.equal(canManageRole(admin, 'admin'), false);
  assert.equal(canManageRole(admin, 'owner'), false);
  assert.equal(canManageRole(member, 'member'), false);
});
