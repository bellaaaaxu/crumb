import express from 'express';
import { AppError } from '../errors.mjs';
import { hashPassword } from '../passwords.mjs';
import { setSessionCookie } from '../auth.mjs';
import {
  checkToken, consumeToken, inviteMember, issueReset, issueSignInLink, previewSignInLink, renewInvitation, updateMember,
  useSignInLink,
} from '../members.mjs';
import { MANAGERS, requireRole } from '../permissions.mjs';
import { qrPng } from '../qr.mjs';
import { readObject, secret } from '../validate.mjs';

const invalidLink = () => new AppError(400, 'INVALID_TOKEN',
  'This link is invalid, has expired or was already used. Ask your team admin for a new one.');

export function memberRoutes({ db, config, clock }) {
  const router = express.Router();
  /* Links carry the token in the fragment: browsers never send it to the
   * server or in a Referer, and the page removes it once read. */
  const link = (kind, token) => `${config.publicOrigin}/#${kind}=${token}`;
  const noBody = req => readObject(req.body ?? {}, {});

  /* Every link comes with its QR code, to scan from the admin's screen or send as a picture. */
  router.post('/admin/invitations', async (req, res) => {
    const { user, token, purpose } = inviteMember(db, req.actor, req.body, clock);
    // A team member gets a sign-in link; an owner or admin an invitation to set a password.
    const url = link(purpose === 'signin' ? 'signin' : 'invite', token);
    const qr = await qrPng(url);
    res.status(201).json(purpose === 'signin' ? { user, signinUrl: url, qr } : { user, invitationUrl: url, qr });
  });

  router.post('/admin/members/:id/signin-link', async (req, res) => {
    requireRole(req.actor, MANAGERS);
    noBody(req);
    const { token, user } = issueSignInLink(db, req.actor, req.params.id, clock);
    const url = link('signin', token);
    res.json({ user, signinUrl: url, qr: await qrPng(url) });
  });

  router.post('/admin/members/:id/invitation', async (req, res) => {
    requireRole(req.actor, MANAGERS);
    noBody(req);
    const { token } = renewInvitation(db, req.actor, req.params.id, clock);
    const url = link('invite', token);
    res.json({ invitationUrl: url, qr: await qrPng(url) });
  });

  router.post('/admin/members/:id/reset', async (req, res) => {
    requireRole(req.actor, MANAGERS);
    noBody(req);
    const { token } = issueReset(db, req.actor, req.params.id, clock);
    const url = link('reset', token);
    res.json({ resetUrl: url, qr: await qrPng(url) });
  });

  router.patch('/admin/members/:id', (req, res) => {
    res.json(updateMember(db, req.actor, req.params.id, req.body, clock));
  });

  const useLink = purpose => async (req, res) => {
    const body = readObject(req.body, { token: secret({ max: 100 }), password: secret({ max: 1024 }) });
    if (!checkToken(db, { token: body.token, purpose }, clock)) throw invalidLink();
    const passwordHash = await hashPassword(body.password);
    res.json(consumeToken(db, { token: body.token, passwordHash, purpose }, clock));
  };
  router.post('/invitations/accept', useLink('invite'));
  router.post('/password/reset', useLink('reset'));

  /* A team member's sign-in link: first say whose it is, then sign this device in. */
  router.post('/signin/preview', (req, res) => {
    const body = readObject(req.body, { token: secret({ max: 100 }) });
    res.json(previewSignInLink(db, { token: body.token }, clock));
  });

  router.post('/signin/accept', (req, res) => {
    const body = readObject(req.body, { token: secret({ max: 100 }) });
    // The session this browser had ends in the same transaction that claims the link.
    const { user, session } = useSignInLink(db, { token: body.token, previousSessionHash: req.session?.tokenHash }, clock);
    setSessionCookie(res, config, session);
    res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }, csrfToken: session.csrfToken });
  });

  return router;
}
