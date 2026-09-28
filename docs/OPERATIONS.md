# Operating Crumb

How to keep a Crumb instance safe once it is running: backups, restores, upgrades,
rollbacks, a locked-out owner, and disk space. The commands assume the Docker Compose setup
from [DEPLOYMENT.md](DEPLOYMENT.md). If you use `compose.https.yaml`, add
`-f compose.yaml -f compose.https.yaml` to each `docker compose` command, or set
`COMPOSE_FILE=compose.yaml:compose.https.yaml` in `.env`.

## Where the data is

| Docker volume | Contents |
| --- | --- |
| `crumb_data` | `crumb.sqlite` (plus `-wal` and `-shm` while running): people, password hashes, the ledger, requests, collections, the activity log, settings and the logo |
| `crumb_backups` | Backups you make with the command below |
| `crumb_caddy_data`, `crumb_caddy_config` | HTTPS certificates (only with `compose.https.yaml`) |

**Never copy `crumb.sqlite` by hand while Crumb runs** — the copy can be half-written. Use
the backup command. Never run `docker compose down -v` on a real instance: `-v` deletes the
volumes and everything in them.

## Backups

```bash
docker compose exec -T crumb node scripts/backup.mjs --output /backups/crumb-$(date +%F).sqlite
```

This uses SQLite's online backup, so Crumb keeps working meanwhile and the result is one
consistent moment — including changes not yet written from the WAL. The command writes one
new self-contained file, checks it, and prints its path and SHA-256. It never overwrites a
file; pick a new name each time.

Then copy it **off the server**:

```bash
docker compose cp crumb:/backups/crumb-2026-09-27.sqlite ./crumb-2026-09-27.sqlite
sha256sum crumb-2026-09-27.sqlite   # compare with the printed value
```

A backup contains everything, including names and password hashes. Store it where only the
people who run the server can read it, encrypted if it leaves your control.

A daily backup at 03:15 with `cron` (as a user allowed to run Docker):

```
15 3 * * * cd /srv/crumb && docker compose exec -T crumb node scripts/backup.mjs --output /backups/crumb-$(date +\%F).sqlite >> /var/log/crumb-backup.log 2>&1
```

Delete old backups on a schedule you are comfortable with, but keep at least one you have
test-restored (below).

The **Download ledger (CSV)** button in Crumb is a readable copy for spreadsheets. It cannot
be restored and is not a backup.

## Restoring

Restore **into a new volume**, check it, then switch — the current volume stays untouched,
so you can switch back.

```bash
docker compose stop crumb
docker volume create crumb_restored_2026_09_27
docker run --rm -v crumb_restored_2026_09_27:/data -v crumb_backups:/backups:ro crumb:local \
  node scripts/restore.mjs --from /backups/crumb-2026-09-27.sqlite --to /data/crumb.sqlite
```

(To restore a file you kept elsewhere, first copy it into the backups volume, for example
with `docker run --rm -v crumb_backups:/backups -v "$PWD":/in:ro crumb:local cp /in/crumb-2026-09-27.sqlite /backups/`.)

The restore refuses to overwrite anything, rejects damaged files and backups made by a newer
Crumb, and clears **sessions, invitation links and password-reset links** in the restored
copy: everyone signs in again, and admins issue new links. People, passwords, the ledger,
requests, collections, the activity log, settings and the logo are kept.

Switch to the restored volume and start Crumb:

```bash
echo "CRUMB_DATA_VOLUME=crumb_restored_2026_09_27" >> .env
docker compose up -d
```

Sign in and check balances, requests and collections. To go back, remove that line from
`.env` and run `docker compose up -d` again.

### Practise it

A backup you have never restored is a hope, not a backup. Every few months, restore the
latest backup into a throwaway volume and look at it on another port, without stopping the
real instance:

```bash
docker volume create crumb_drill
docker run --rm -v crumb_drill:/data -v crumb_backups:/backups:ro crumb:local \
  node scripts/restore.mjs --from /backups/crumb-2026-09-27.sqlite --to /data/crumb.sqlite
docker run --rm -p 127.0.0.1:3001:3000 -v crumb_drill:/data \
  -e PUBLIC_ORIGIN=http://localhost:3001 -e ALLOW_LOCAL_HTTP=true crumb:local
# open http://localhost:3001 on the server (or through an SSH tunnel), sign in, check, then Ctrl+C
docker volume rm crumb_drill
```

The repository's CI runs the same drill — backup in a running container, restore into a new
volume, switch, sign in, roll back — on every change (`scripts/ci/container-drill.sh`).

## Upgrading

1. **Back up first** (above) and copy the backup off the server.
2. Keep the current image so you can roll back:
   `docker tag crumb:local crumb:before-upgrade`
3. Get the new version and rebuild:
   ```bash
   git pull
   docker compose up -d --build
   ```
4. Crumb updates its database on start. Sign in and check.

### Rolling back

Code and data roll back together. Once a newer Crumb has updated the database, an older
Crumb refuses to open it (it says the schema is newer than it understands) instead of
guessing. So:

1. `docker compose stop crumb`
2. Restore your pre-upgrade backup into a new volume and point `CRUMB_DATA_VOLUME` at it
   (see Restoring).
3. Start the old image: `docker tag crumb:before-upgrade crumb:local && docker compose up -d --no-build`

## An owner is locked out

Admins can issue password-reset links for members, and owners for anyone — but if the only
owner forgot their password, reset it on the server:

```bash
docker compose exec crumb node scripts/recover-owner.mjs --username alice
```

It asks for the new password twice without showing it (you can also pipe it in), ends that
owner's sessions and links, and writes "Reset an owner password from the server" to the
activity log. It only works for existing owner accounts, and there is deliberately no web
page for it.

## Health, logs and disk space

- `docker compose ps` shows `healthy` when `/healthz` answers. It reports only whether the
  database responds.
- `docker compose logs crumb` shows startup and errors by type. Crumb never logs passwords,
  links, cookies or request bodies.
- `docker system df -v` shows how much space the volumes and backups use. SQLite's `-wal`
  file grows between checkpoints and shrinks again; backups are the thing that accumulates.
- Expired sessions and finished sign-in windows are cleaned up automatically every ten
  minutes.

## Moving to another server

Back up, copy the backup to the new server, set up the new server as in
[DEPLOYMENT.md](DEPLOYMENT.md) **without** running setup, restore into its data volume, then
start it and point your domain at it. Everyone signs in again on the new server.
