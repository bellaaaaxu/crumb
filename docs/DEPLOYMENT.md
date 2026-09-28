# Deploying Crumb

Crumb runs as one small server with one SQLite database. **One instance serves one
organization.** Teams that need separate rules or separate data run separate instances.

This guide covers trying Crumb on your own computer, then running it for real on a server
behind HTTPS. Day-to-day care — backups, restores, upgrades, locked-out owners — is in
[OPERATIONS.md](OPERATIONS.md).

> Crumb is early software (version 0.1). Read [what has and has not been tested](VALIDATION.md)
> before you rely on it for your team's benefits.

## What you need

| | Try it locally | Run it for your team |
| --- | --- | --- |
| Machine | Any computer with Docker | A Linux server or VM (x64 or arm64) with Docker Engine and Docker Compose v2 |
| Memory | 1 GB free | 1 GB or more (each sign-in briefly uses about 128 MB for password hashing) |
| Network | Nothing | A domain name pointing at the server; ports 80 and 443 open |
| Other | Node.js 24 *or* Docker to create the setup code | The same |

Hosting a server costs money with most providers. Crumb itself is free (MIT), but this
guide does not promise that running it is.

Crumb does not send email, does not need any outside service, and sends nothing about your
organization anywhere. Invitation and password-reset links are shown to an admin, who passes
them on however the team normally talks.

## Before you start: credit or points?

The first owner chooses how rewards are counted, once:

- **Credit** — an amount of money for benefits, in CAD, USD or CNY, to the cent
  (for example "$12.50 of café credit").
- **Points** — whole numbers under a name you choose (for example "100 stars").

You also choose the **unlock step**: each time someone's total recognition passes another
step of this size, a new pixel collectible joins their shelf. The type, currency and step
can change until the first reward is recorded. After that they are fixed, so amounts already
in the ledger keep their meaning. Names, the welcome message, the language and links can
always change.

## 1. Get the code and create the setup code

```bash
git clone https://github.com/bellaaaaxu/crumb.git
cd crumb
```

Crumb's first owner is created with a one-time **setup code** that only someone with access
to the server can read. Create it, and a starting `.env`, with **one** of these:

```bash
# If Node.js 24 is installed
node scripts/init-secrets.mjs
```

```bash
# If only Docker is installed (Linux or macOS shell)
docker run --rm -v "$PWD":/work -w /work --user "$(id -u):$(id -g)" \
  node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 \
  node scripts/init-secrets.mjs
```

This writes `.secrets/setup-token` (readable only by you) and `.env`. It never prints the
code and never overwrites existing files. Neither file belongs in version control; both are
already in `.gitignore`.

On Windows, the files are created in your user profile with your user's permissions; keep
the project folder somewhere other accounts on the machine cannot read.

## 2. Try it on this computer

```bash
docker compose up -d --build
```

Open <http://localhost:3000>. Crumb shows **Set up Crumb**. Paste the setup code — print it
with `cat .secrets/setup-token` — then name your organization, choose credit or points, and
create your owner account (a password of 12 to 128 characters).

`docker compose ps` shows the container as `healthy` once it is ready. The app only listens
on `127.0.0.1:3000`, so other devices on your network cannot reach this local copy.

## 3. Run it for your team, behind HTTPS

1. Point a domain (for example `crumb.example.com`) at your server with an A or AAAA record,
   and allow ports 80 and 443 through the server's firewall.

2. On the server, in the project folder:

   ```bash
   node scripts/init-secrets.mjs --origin https://crumb.example.com
   ```

   `.env` now holds `PUBLIC_ORIGIN=https://crumb.example.com`, `ALLOW_LOCAL_HTTP=false` and
   `SITE_ADDRESS=crumb.example.com`. If you already ran it without `--origin`, delete `.env`
   first or edit those three lines.

3. **Let the container read the setup code.** The app runs as the image's unprivileged
   `node` user, which has user id **1000**, and Docker Compose passes the secret file through
   with its owner and permissions unchanged. If your deploy user's id is not 1000 (check with
   `id -u`), give user 1000 — and nobody else — read access:

   ```bash
   sudo chown 1000:1000 .secrets/setup-token
   sudo chmod 0400 .secrets/setup-token
   ```

   (Or keep your ownership and grant read access with
   `setfacl -m u:1000:r .secrets/setup-token`.) Do not make the file world-readable. If the
   container cannot read it, the setup page says the setup code file is missing.

4. Start Crumb with Caddy in front. Caddy fetches and renews the certificate by itself:

   ```bash
   docker compose -f compose.yaml -f compose.https.yaml up -d --build
   ```

5. Open `https://crumb.example.com` and finish setup as in step 2.

After setup the code cannot create anything any more; keeping the file is harmless (Compose
expects it to exist).

## After setup

- **Team → Members:** invite admins and members. Each invitation gives you a one-time link
  (valid 7 days) to send yourself.
- **Team → Benefits:** add what people can redeem, with a price in your unit.
- **Give recognition:** choose a person, an amount and a message. They see it on My Crumb.
- **Settings:** your logo, welcome message, default language, and where "Contact your admin"
  should lead (an `https://` page or a `mailto:` address).
- Schedule backups now — see [OPERATIONS.md](OPERATIONS.md).

## Running without Docker

Crumb is a plain Node.js app. With Node.js **24.14 or newer** (24.x):

```bash
npm ci --omit=dev
node scripts/init-secrets.mjs --origin https://crumb.example.com
PUBLIC_ORIGIN=https://crumb.example.com DATA_DIR=/var/lib/crumb npm start
```

Put a reverse proxy with HTTPS in front (Caddy, nginx or similar) and set `TRUST_PROXY=1` so
sign-in limits see the real client address. Run it as an unprivileged user that owns
`DATA_DIR`. Without a proxy, Crumb listens on `127.0.0.1` only; set `HOST` to change that.

## Settings reference

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | *(required)* | The exact address people use, like `https://crumb.example.com`. Every change request must come from this origin. |
| `ALLOW_LOCAL_HTTP` | `false` | `true` allows plain `http://` for `localhost` or `127.0.0.1` only. Any other address must be `https://`. |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where `crumb.sqlite` lives. |
| `SETUP_TOKEN_FILE` | `./.secrets/setup-token` (`/run/secrets/setup_token` in Docker) | The one-time setup code. |
| `PORT` | `3000` | Port the app listens on. |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Address the app binds to. |
| `TRUST_PROXY` | `false` | `1` when exactly one reverse proxy sits in front (as in `compose.https.yaml`). |
| `CRUMB_DATA_VOLUME` | `crumb_data` | Compose only: which Docker volume holds the database. Used when restoring. |

## Security notes

- Sign-in is by username and password. Passwords are stored only as scrypt hashes. Five
  failed attempts lock an account for 15 minutes; thirty lock an address.
- Sessions last at most 12 hours and are cookies Crumb's pages cannot read. Changing a
  password, resetting it or deactivating someone ends their sessions.
- Every permission is checked by the server. Members can only see their own balance,
  collection, history and requests; there are no leaderboards or cross-member comparisons.
- The server logs startup, errors by type, and nothing else: no passwords, links, cookies or
  request bodies.
- Crumb has no analytics and sends no data to anyone, including the Crumb project.
