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
organization anywhere. Sign-in, invitation and password-reset links are shown to an admin, who
passes them on privately, however the team normally talks. (With the HTTPS setup below, the Caddy proxy
contacts Let's Encrypt to obtain and renew the certificate — that is the only outside
connection, and it is Caddy's, not Crumb's.)

## Before you start: credit or points?

The first owner chooses how rewards are counted, once:

- **Credit** — an amount of money for benefits, in CAD, USD or CNY, to the cent
  (for example "$12.50 of café credit").
- **Points** — whole numbers under a name you choose (for example "100 stars").

You also choose the **unlock step**: each time someone's total recognition passes another
step of this size, a new pixel collectible joins their shelf.

The type and currency can change until the **first benefit gets a price** or the first
reward is recorded; the unlock step until the first reward. After that they are fixed, so
amounts already recorded keep their meaning. So settle credit or points, and the currency,
before you add benefits. Names, the welcome message, the language and links can always
change.

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

This writes `.secrets/setup-token` and `.env`. It never prints the code and never
overwrites existing files. Neither file belongs in version control; both are already in
`.gitignore`.

The `.secrets` folder is closed to other users on the machine. The code file inside it is
readable, so the container (which runs as user id 1000) can read it whatever your own user id
is: Compose mounts that one file into the container, which never needs the folder. On
Windows these permission bits do not apply; the files get your user's normal permissions, so
keep the project folder where other accounts on the machine cannot read it.

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

   `.env` now holds `PUBLIC_ORIGIN=https://crumb.example.com`, `ALLOW_LOCAL_HTTP=false`,
   `SITE_ADDRESS=crumb.example.com` and `COMPOSE_FILE=compose.yaml:compose.https.yaml`. The
   last one makes every `docker compose` command in this folder include the HTTPS proxy —
   upgrades, backups and restores too. If you already ran it without `--origin`, delete
   `.env` first.

3. Start Crumb with Caddy in front. Caddy fetches and renews the certificate by itself:

   ```bash
   docker compose up -d --build
   ```

4. Open `https://crumb.example.com` and finish setup as in section 2 above.

After setup the code cannot create anything any more; keeping the file is harmless (Compose
expects it to exist).

## After setup

- **Team → Members:** invite admins and members. Each invitation gives you a one-time link
  (valid 7 days) and its QR code. In person, the person scans the code with their phone's
  camera; otherwise send the picture — **Save QR code** and drag it into the chat, or **Share
  QR code** where the system offers it — and a long press on it opens the link on their phone;
  or copy the link instead. A team
  member is then signed in, with no password; an admin or owner uses theirs to choose a
  password. When a member changes or loses their phone, or their link expired, **New sign-in
  link** makes another (after asking) and signs the old phone out. Until a team member
  dismisses it in that browser, My Crumb suggests putting it on their home screen.
- **Team → Benefits:** add what people can redeem, with a price in your unit. (The first
  price fixes credit or points and the currency.)
- **Give recognition** (on the Team overview): choose a person, an amount and a message. They
  see it on My Crumb.
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
sign-in limits see the real client address. The proxy must send `X-Forwarded-For` — Caddy
does by default; with nginx add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
Without it every visitor shares the proxy's address, and one person's failed sign-ins can
lock everyone out for 15 minutes. Run Crumb as an unprivileged user that owns `DATA_DIR`
(the database is created readable by that user only). Without a proxy, Crumb listens on
`127.0.0.1` only; set `HOST` to change that.

## Settings reference

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | *(required; `compose.yaml` uses `http://localhost:3000` if `.env` does not set it)* | The exact address people use, like `https://crumb.example.com`. Every change request must come from this origin; a page opened at any other address says where to go instead. |
| `ALLOW_LOCAL_HTTP` | `false` (`true` in `compose.yaml` unless `.env` says otherwise) | `true` allows plain `http://` for `localhost` or `127.0.0.1` only. Any other address must be `https://`. |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where `crumb.sqlite` lives. |
| `SETUP_TOKEN_FILE` | `./.secrets/setup-token` (`/run/secrets/setup_token` in Docker) | The one-time setup code. |
| `PORT` | `3000` | Port the app listens on. |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Address the app binds to. |
| `TRUST_PROXY` | `false` | `1` when exactly one reverse proxy sits in front (as in `compose.https.yaml`). |
| `CRUMB_DATA_VOLUME` | `crumb_data` | Compose only: which Docker volume holds the database. Used when restoring. |
| `CRUMB_BACKUP_VOLUME` | `crumb_backups` | Compose only: the volume mounted at `/backups`. |
| `CRUMB_IMAGE` | `crumb:local` | Compose only: the image tag that is built and run. |
| `COMPOSE_FILE` | *(Compose default)* | Compose's own setting. `init-secrets --origin` sets it to `compose.yaml:compose.https.yaml`. |
| `SITE_ADDRESS` | *(required with `compose.https.yaml`)* | The domain Caddy gets a certificate for. |

## Security notes

- Owners and admins sign in with a username and password. Passwords are stored only as
  scrypt hashes. Five failed attempts lock an account for 15 minutes, even with the right
  password (owner recovery in [OPERATIONS.md](OPERATIONS.md) lifts it for an owner); thirty
  lock an address, and an IPv6 /64 counts as one address.
- Team members have no password. They sign in with a personal link an admin makes for them:
  it works once, within 7 days, and is stored only as a hash. Opening it only shows whose link
  it is; whoever then taps "Sign in on this device" first is signed in as that member, so send
  it privately. A member is signed in on one device at a time: using a link, or an admin
  making a new one, signs them out everywhere else — which is also how a lost phone is cut off
  (or deactivate the account). Signing out on purpose also means asking for a new link, so the
  page asks a member before signing them out.
- A QR code is the link itself: whoever uses it first is signed in, so send the picture as
  privately as you would the link. Crumb makes it on your server and sends it nowhere; once you
  send it through a chat app it is as private as that chat, and a saved picture stays on your
  computer until you delete it (do, once it has been used).
- Each browser counts as its own device. A link opened inside a chat app's built-in browser
  (WeChat or WhatsApp, say) signs in that browser, not Safari or Chrome on the same phone —
  and that includes a QR code scanned or long-pressed in WeChat, whose page then says to open
  it in the browser first (inside WeChat the page keeps the link in its address until it is
  used, so "Open in Browser" can carry it over). Tapping the used link again in the chat simply opens Crumb while
  that browser is still signed in.
- The home-screen icon opens Crumb in the browser (its manifest says `display: browser`), so
  it shares the browser's sign-in. On iPhone, where adding a site can make it a separate web
  app with its own storage, the tip tells people to turn off "Open as Web App"; an iPhone
  home-screen app that starts signed out explains how to add the icon again.
- An owner's or admin's session lasts at most 12 hours; a team member's device stays signed
  in for up to 180 days. Sessions are cookies Crumb's pages cannot read. Using a
  password-reset link, a role change, owner recovery and deactivation end that person's
  sessions. There is no self-service password change in this version: an owner makes a
  reset link.
- Every permission is checked by the server. Members can only see their own balance,
  collection, history and requests; there are no leaderboards or cross-member comparisons.
- The server logs startup, errors by type, and nothing else: no passwords, links, cookies or
  request bodies.
- The browser keeps three things for Crumb in its local storage: the chosen language, whether
  a team member dismissed the home-screen tip, and — for a change whose answer never arrived —
  a random request key with a one-way fingerprint of the change (never names, amounts or
  messages), so sending it again after a reload is not recorded twice. Those keys go once an
  answer arrives, and after seven days in any case.
- Crumb has no analytics and sends no data to anyone, including the Crumb project.
