# Operating Crumb

How to keep a Crumb instance safe once it is running: backups, restores, upgrades (including
from 0.1 to 0.2 and from 0.2 to 0.3), a theme this version does not include, rollbacks, a
locked-out owner, and disk space; and switching how people spend, changing the collection
theme, putting a mistaken entry right, and how a treat to several people is recorded.
The commands assume the Docker Compose setup
from [DEPLOYMENT.md](DEPLOYMENT.md) and are run in the project folder. With HTTPS,
`init-secrets --origin` put `COMPOSE_FILE=compose.yaml:compose.https.yaml` in `.env`, so
every `docker compose` command below includes the proxy. (If your `.env` predates that,
add those two lines from `.env.example`; leaving the proxy out drops `TRUST_PROXY`, and then
everyone shares one sign-in limit.) If you set `CRUMB_IMAGE`, use that name wherever a command
below says `crumb:local`.

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

A backup contains everything, including names and password hashes. The file is created
readable only by the user Crumb runs as. Store copies where only the people who run the
server can read them, encrypted if they leave your control.

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

To restore a file you kept elsewhere, first copy it into the backups volume. Backups are
readable only by their owner, so the copy runs as root inside the container and hands the
file to Crumb's user:

```bash
docker run --rm -u 0 -v crumb_backups:/backups -v "$PWD":/in:ro crumb:local \
  install -o node -g node -m 600 /in/crumb-2026-09-27.sqlite /backups/crumb-2026-09-27.sqlite
```

The restore refuses to overwrite anything (including leftover `-wal` files at the target),
rejects damaged files, files that fail a full integrity and reference check, and backups made
by a newer Crumb, and clears **sessions and every one-time link** (sign-in, invitation and
password-reset links) in the restored copy. Owners and admins sign in again with their
passwords; **every team member needs a new sign-in link** from an admin (on the Team page,
open the person's row, then New sign-in link), so plan a moment to send them round. People,
passwords, the ledger, requests, collections, the activity log, settings and the logo are
kept.

The restored copy keeps the database version the backup had; Crumb updates it when it
starts. It also refuses a file with a `-wal` or `-journal` file beside it: that is a copy
of a running (or crashed) database whose latest changes are in the other file. Restore a file
made by the backup command instead, or stop the Crumb that uses it first.

A backup whose team uses a collection theme this version does not include is refused too,
like one from a newer schema, before the restored file is created: see
[Unknown theme](#unknown-theme). Backups from before 0.3 (schema 1 and 2), and backups taken
before setup, count as the Pastry shop and restore as usual.

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

The repository's CI is set up to run the same drill — backup in a running container,
restore into a new volume, switch, sign in, roll back — on every pull request
(`scripts/ci/container-drill.sh`). [VALIDATION.md](VALIDATION.md) says whether it has run.

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

### Upgrading from 0.1 to 0.2

Crumb 0.1 (commit `643e237`) keeps its database at schema version 1, and 0.2 at schema
version 2. The footer of the signed-in pages says which version is running (Crumb 0.1.0 or
Crumb 0.2.0), and the backup command prints the schema: `schema 1` before the update and
`schema 2` after it. The first start of 0.2 runs migration 002 on a schema 1 database once,
before the port opens:

- The organization gets its spending mode: **confirmed** if the team already has at least one
  benefit (it was used that way), **self-recorded** otherwise. An owner can change it at any
  time afterwards (see [Switching how people spend](#switching-how-people-spend)).
- The ledger table is rebuilt to take two new kinds of entry (`spend` and `void`) and a batch
  id: the same rows under the same ids, with its indexes and append-only triggers made again.
  Benefits get an optional icon.
- All of it runs in one transaction. Before it commits, every reference between tables is
  checked. If the database holds a reference to a row that does not exist, the update stops,
  **nothing is changed**, and Crumb does not start: `docker compose logs crumb` shows "Crumb
  cannot start: Updating the database to schema 2 was stopped and nothing was changed" and
  names the first rows. Crumb 0.1 never writes such a reference, so this points at a
  damaged or hand-edited file. The database is untouched, so the previous image still opens
  it: put it back with steps 1, 2 and 4 of [Rolling back](#rolling-back) (no restore
  needed), and look into the file or restore a good backup before trying again.

Back up first, as for any upgrade. Once the update has run, 0.1 refuses the database (its
schema is newer), so going back means restoring the backup made before it, as below.

### Upgrading from 0.2 to 0.3

Crumb 0.3 keeps its database at schema version 3. The footer of the signed-in pages says which
version is running (Crumb 0.2.0 or Crumb 0.3.0), and the backup command prints `schema 2`
before the update and `schema 3` after it. The first start of 0.3 runs migration 003 on a
schema 2 database once, before the port opens:

- The organization gets its collection theme (`organization.theme`). An existing team is on
  the **Pastry shop** (`default`): its shelves, mascot, icons and the sentences about the
  collection stay exactly as in 0.2.
- Nothing else is changed.

It runs in one transaction, and every reference between tables is checked before it commits,
as in the update to 0.2: if one points at a missing row, nothing is changed and Crumb does not
start (`docker compose logs crumb` shows "Crumb cannot start: Updating the database to schema
3 was stopped and nothing was changed" and names the first rows). Crumb 0.2 never writes such
a reference, so this points at a damaged or hand-edited file. The database is untouched, so
the previous image still opens it: put it back with steps 1, 2 and 4 of
[Rolling back](#rolling-back) (no restore needed), and look into the file or restore a good
backup before trying again.

After the update, an owner's Settings has the collection theme under Rewards. A team that has
already sent a treat sees the theme cards greyed out, on the Pastry shop: like the unlock
step, the theme is fixed after the first treat. A team that has not can still change it (see
[Changing the collection theme](#changing-the-collection-theme)).

Crumb 0.1 can be upgraded straight to 0.3. The first start then runs migrations 002 and 003
in one transaction — everything [Upgrading from 0.1 to 0.2](#upgrading-from-01-to-02)
describes, then the theme — and a failure message names schema 3: "Updating the database to
schema 3 was stopped and nothing was changed".

Back up first, as for any upgrade. Once the update has run, 0.2 refuses the database (its
schema is newer), so going back means restoring the backup made before it (see
[Rolling back](#rolling-back)).

### Unknown theme

Each version of Crumb includes a fixed set of collection themes. A database whose team uses a
theme this version does not include — one last used by a newer Crumb with more themes, for
example — is refused instead of guessed at, and Crumb does not start. `docker compose logs
crumb` shows, with the theme's id in place of `{id}`:

```
Crumb cannot start: This database uses the collection theme "{id}", which this version of Crumb does not include. Run a newer Crumb, or restore a backup made by this version.
```

As it says: run a version of Crumb that includes the theme, or restore a backup made by this
version (see [Restoring](#restoring)). `scripts/recover-owner.mjs` refuses such a database
with the same message, and `scripts/restore.mjs` refuses such a backup before creating the
restored file. A database whose team has not been set up yet always opens.

`scripts/backup.mjs` does not check the theme, so it still backs up such a database. Crumb
does not start, so `docker compose exec` cannot reach it; run the backup with
`docker compose run` instead:

```bash
docker compose run --rm crumb node scripts/backup.mjs --output /backups/crumb-$(date +%F).sqlite
```

### Rolling back

Code and data roll back together. Once a newer Crumb has updated the database, an older
Crumb refuses to open it (it says the schema is newer than it understands) instead of
guessing. It refuses a database whose team uses a collection theme it does not include in the
same way ([Unknown theme](#unknown-theme)). So:

1. `docker compose stop crumb`
2. Put the old image back: `docker tag crumb:before-upgrade crumb:local`
3. Restore your pre-upgrade backup into a new volume and point `CRUMB_DATA_VOLUME` at it
   (see Restoring). The restored copy keeps the backup's older database version, so the old
   image can open it.
4. `docker compose up -d --no-build`

## An owner is locked out

Team members have no password: an admin makes them a new sign-in link. Owners make
password-reset links for admins and other owners — but if the only owner forgot their
password, reset it on the server:

```bash
docker compose exec crumb node scripts/recover-owner.mjs --username alice
```

It asks for the new password twice without showing it. To pipe it in instead, add `-T`:
`printf '%s\n' "$NEW_PASSWORD" | docker compose exec -T crumb node scripts/recover-owner.mjs --username alice`.
It ends that owner's sessions and links, lifts the sign-in lock on that username (five
failed attempts lock an account for 15 minutes, even with the right password), and writes
"Reset an owner password from the server" to the activity log. It only works for owners who
have joined (an owner who used to be a team member and never had a password gets one); for
an owner who was invited but never joined, another owner makes a new invitation link. There
is deliberately no web page for it.

## Health, logs and disk space

- `docker compose ps` shows `healthy` when `/healthz` answers. It reports only whether the
  database responds.
- `docker compose logs crumb` shows startup and errors by type. Crumb never logs passwords,
  links, cookies or request bodies.
- `docker system df -v` shows how much space the volumes and backups use. SQLite's `-wal`
  file grows between checkpoints and is reused rather than shrunk while Crumb runs (it goes
  away when Crumb stops cleanly); backups are the thing that accumulates.
- Expired sessions and finished sign-in windows are cleaned up automatically every ten
  minutes.

## Switching how people spend

A team spends in one of two ways, chosen at setup:

- **Self-recorded** (the default): people tap *I grabbed something*, key in what they took,
  and it comes off their balance at once.
- **Confirmed**: people ask for a benefit from the team's list; the amount is set aside, and
  it comes off once an admin confirms the benefit was handed over.

An owner switches at any time under **Settings → How people spend**; the lock on the reward
rules does not apply to it. Each person's page shows the new way the next time it loads (a
page still showing the old way says to refresh). Requests still waiting when a team switches
to self-recorded are finished as usual: they stay under the member's "Your requests" and the
admins' "Waiting on you" until they are confirmed, declined or cancelled. A team switching to
confirmed starts with the benefits already on its list, none if it never had any: add them on
the Team page.

## Changing the collection theme

A team's collection theme — the Pastry shop or the Bakery — decides the pictures on everyone's
shelf, the mascot, the browser tab and home-screen icons, and a few sentences about the
collection. It is chosen at setup (the Pastry shop unless the owner picks another). Until the
first treat, an owner can change it under **Settings → Rewards → Collection theme**: tapping a
card selects it, and **Save settings** applies it. Any entry in the ledger then fixes it,
together with the unlock step: the cards are greyed out, and the server refuses a change.
Teams upgraded from 0.2 that had already sent a treat stay on the Pastry shop.

Nobody has unlocked anything before the first treat, so a change touches no one's shelf. It
does touch benefit icons: in the same save, every benefit (active or not) whose icon the new
theme does not have loses its icon, and Settings says how many, for example "Theme changed. 2
benefit icon(s) aren’t in this theme, so they were removed. You can pick new ones." instead of
"Settings saved.". Icons the two themes share are kept. Pick new icons on the Team page. The
activity log records the change; its detail (`GET /api/admin/audit`) has the old and the new
theme and how many icons were removed.

The page that saved the change switches its tab icon right away; other pages already open
switch the next time they load. An icon already on a phone's home screen keeps its old picture
until it is removed and added to the home screen again.

## Putting a mistaken entry right

The ledger is append-only: nothing in it is edited or deleted. A mistake is put right with a
new entry, from the log on the Team page, and always with a reason:

- **A self-recorded entry** (a slip of the finger, the same lunch keyed in twice): **Fix**.
  The amount goes back to the person, and the log keeps both rows: the entry, marked "Put
  right", and the correction ("A slip, put right"; "Fixed" in the member's recent log). Each
  entry can be put right once. Team members cannot undo their own entries; they ask an admin.
- **A treat**: **Take back**. The original stays, marked "Taken back". Collectibles already
  on the shelf stay.
- **A confirmed benefit**: **Refund**, once. The request stays, marked "Refunded".

The CSV export and the activity log keep both rows, with who made each one.

## Treats to several people

A treat to several people is recorded all or nothing, in one transaction, but it is not one
entry: each person gets their own `grant` row in the ledger and their own collectibles, and
the rows share one batch id.

- The **Team log** shows the batch as one line: the amount each, how many people, the date
  and the message, whatever page of the log its rows fall on. Opened, it lists each person
  with their own **Take back**, so one person's treat can be taken back without touching the
  others.
- The **activity log** (Settings → Who did what for owners; for admins, read-only at the bottom
  of the Team page) has one row per person, such as "Treated Sam Okafor to $20.00", the same as
  a treat to one person. Each row's detail carries the shared `batchId` (`GET /api/admin/audit`).
- The **CSV export** has one `grant` line per person; the batch id is not one of its columns.

## Moving to another server

1. Back up, and copy the backup to the new server.
2. On the new server, follow [DEPLOYMENT.md](DEPLOYMENT.md) up to — not including — the
   first `docker compose up`, then build the image: `docker compose build`.
3. Copy the backup into the backups volume with the `install` command under Restoring, restore
   it into a new volume, and put `CRUMB_DATA_VOLUME=<that volume>` in `.env`. (Restoring into
   a volume Crumb has already started on is refused: it already holds a database.)
4. `docker compose up -d`, check it, then point your domain at the new server.

Everyone signs in again on the new server.
