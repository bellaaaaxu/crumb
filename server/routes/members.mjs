import express from 'express';
import { AppError } from '../errors.mjs';
import { hashPassword } from '../passwords.mjs';
import { checkToken, consumeToken, inviteMember, issueReset, renewInvitation, updateMember } from '../members.mjs';
import { readObject, secret } from '../validate.mjs';

const invalidLink = () => new AppError(400, 'INVALID_TOKEN',
  'This link is invalid, has expired or was already used. Ask your team admin for a new one.');

export function memberRoutes({ db, config, clock }) {
  const router = express.Router();
  /* Links carry the token in the fragment: browsers never send it to the
   * server or in a Referer, and the page removes it once read. */
  const link = (kind, token) => `${config.publicOrigin}/#${kind}=${token}`;
  const noBody = req => readObject(req.body ?? {}, {});

  router.post('/admin/invitations', (req, res) => {
    const { user, token } = inviteMember(db, req.actor, req.body, clock);
    res.status(201).json({ user, invitationUrl: link('invite', token) });
  });

  router.post('/admin/members/:id/invitation', (req, res) => {
    noBody(req);
    const { token } = renewInvitation(db, req.actor, req.params.id, clock);
    res.json({ invitationUrl: link('invite', token) });
  });

  router.post('/admin/members/:id/reset', (req, res) => {
    noBody(req);
    const { token } = issueReset(db, req.actor, req.params.id, clock);
    res.json({ resetUrl: link('reset', token) });
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

  return router;
}
