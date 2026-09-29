import express from 'express';
import { AppError } from '../errors.mjs';
import { normalizeLogo, readLogo, removeLogo, setLogo, updateOrg } from '../org.mjs';
import { requireRole } from '../permissions.mjs';
import { readObject } from '../validate.mjs';
import { readQuery } from './read-models.mjs';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function orgRoutes({ db, clock }) {
  const router = express.Router();
  // Checked before the upload body is read, so non-owners cannot make the server buffer a megabyte.
  const ownerOnly = (req, res, next) => {
    requireRole(req.actor, ['owner']);
    next();
  };

  router.patch('/org', (req, res) => {
    res.json(updateOrg(db, req.actor, req.body, clock));
  });

  router.put('/org/logo', ownerOnly, express.raw({ type: IMAGE_TYPES, limit: '1mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body))
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload the logo as image/png, image/jpeg or image/webp.');
    const png = await normalizeLogo(req.body);
    setLogo(db, req.actor, png, clock);
    res.status(204).end();
  });

  router.delete('/org/logo', ownerOnly, (req, res) => {
    readObject(req.body ?? {}, {});
    removeLogo(db, req.actor, clock);
    res.status(204).end();
  });

  /* Public: the sign-in page shows it. Always the re-encoded PNG, never the upload. */
  router.get('/org/logo', (req, res) => {
    readQuery(req.query, ['v']); // v: the cache-buster the settings page adds after an upload
    const png = readLogo(db);
    if (!png) throw new AppError(404, 'NOT_FOUND', 'No logo has been set.');
    res.type('image/png').send(png);
  });

  return router;
}
