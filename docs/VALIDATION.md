# Validation report

What has been checked for Crumb 0.1, how, where — and what has **not** been checked. Nothing
here is marked as passing unless it was actually run. The per-requirement view is in
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).

## In short

- **Checked:** every unit, API, concurrency and browser test, the operations drill with real
  server processes, and the whole set again from a fresh clone of the branch — on one
  Windows computer, in Chromium.
- **Not checked:** anything that needs Docker. The image has never been built, and the
  Compose files, the HTTPS setup with Caddy and the container drill have never run. CI is set
  up to run the container drill on a pull request; it has not run yet.
- **Reviewed:** by AI code-review agents working from the code (four passes, below). No
  human review and no professional security audit has happened yet.
- So Crumb 0.1 is **not yet validated for managing a real team's benefits.** The steps still
  needed are at the end of the checklist.

## Environment

| | |
| --- | --- |
| Commit | `29ebc8d` on branch `feature/self-hosted` (base `705ae23`); the commit that adds this report changes only documents and the documents test |
| Date | 2026-09-28 |
| Machine | Windows 11 Pro 10.0.26200 |
| Node.js / npm | 24.14.0 / 11.9.0 (the container image targets 24.21.0 — not run) |
| SQLite | 3.53.4, bundled with better-sqlite3 13.0.3 |
| Images | sharp 0.35.5 with libvips 8.18.7 |
| Browser | Chromium 153.0.8010.12, from Playwright 1.63.0 |
| Docker | **not installed** |

## Results from a fresh clone

A new clone of the branch into an empty temporary folder, with no files carried over:

| Step | Command | Result |
| --- | --- | --- |
| Install the locked dependencies | `npm ci` | passed — nothing compiled (see `.npmrc`) |
| Unit, API, concurrency and operations tests | `npm test` | 158 tests: 156 passed, **2 skipped** (file permissions and umask, which Windows does not have — see below) |
| Browser tests | `npm run test:e2e` | 26 of 26 passed (Chromium only) |
| Operations drill with real server processes | `node scripts/ci/process-drill.mjs` | 20 of 20 checks passed |
| Collectible manifest | `node scripts/theme-manifest.mjs --check` | current (39 collectibles) |
| Whitespace in the change | `git diff --check 705ae23..HEAD` | clean |
| Compose files, image, container drill | `docker compose config`, `docker compose build`, `bash scripts/ci/container-drill.sh` | **not run** (no Docker) |

The same checks also passed in the working copy after each group of fixes.

## What the tests cover

| Area | Where | Notes |
| --- | --- | --- |
| Exact amounts, both units, input limits | `tests/units.test.mjs`, `tests/ledger.test.mjs` | Server and browser parsers are checked against each other on the same inputs. |
| Ledger, revokes, refunds, retries | `tests/ledger.test.mjs`, `tests/redemptions.test.mjs`, `tests/api.test.mjs` | Append-only rows enforced by the database itself (`tests/db.test.mjs`). |
| Two devices at once | `tests/concurrency.test.mjs` | Worker threads with separate database connections: overspending, the same request twice, deactivation racing a request. |
| Roles, sessions, sign-in limits, CSRF, links | `tests/auth.test.mjs`, `tests/members.test.mjs`, `tests/permissions.test.mjs`, `tests/api.test.mjs` | Includes the link-takeover and replay cases found in review. |
| Settings, logo upload, CSV export | `tests/org.test.mjs`, `tests/csv.test.mjs` | Upload limits and re-encoding, formula-safe CSV, export only from Crumb's own pages. |
| Backup, restore, owner recovery | `tests/backup.test.mjs`, `tests/ops.test.mjs`, the process drill | See the record below. |
| Member and team journeys | `tests/e2e/product.spec.mjs` | Credit and points, two browser contexts as two devices, invitations, deactivation, settings in Chinese, lost answers and retries. |
| Phone and laptop layout, keyboard, reduced motion, HTML-looking input | `tests/e2e/accessibility.spec.mjs` | 390 px and 1440 px widths, no sideways scrolling, no CSP violations. |
| Public demo and documents | `tests/e2e/demo.spec.mjs`, `tests/docs.test.mjs` | Local links and images resolve; external links are not fetched by the tests. |

### Tests shown to catch the bug they are for

- Removing the transaction around a benefit request made the overspending test fail 3 of 3
  times.
- Giving every opened dialog a new request key again (the old behaviour) made both
  lost-answer browser tests fail: two rewards, two requests.
- Planting one invisible direction-control character in a source file made the new source
  check fail.
- Every problem found in review got a test first, and each was seen failing for the reported
  reason before the fix (for example, restoring with a copy of the code that has one more
  migration reproduced the reported "schema too new" failure).

## Backup and restore record

- **Process drill** (real server processes, a temporary folder): start, first setup, a
  reward, restart, a backup while the server runs, restore into a new folder, start on the
  restored copy, sign in, compare balance and collection, owner recovery, then roll back to
  the original folder and check it is untouched. 20 of 20 checks passed.
- **Tests:** a backup taken while another connection keeps writing is one consistent moment;
  a restore keeps every business table (people, ledger, requests, benefits, collections,
  stored responses, activity log, logo) and clears sessions and links; a restore made by a
  newer version still opens in the older one; damaged files, files with a broken index or
  orphaned rows, copies of a running database and existing targets are refused.
- **Not done:** the same drill with Docker volumes (`scripts/ci/container-drill.sh`), and a
  restore of a real organization's data.

## Reviews

Three review agents read the code at `0c7e6c7`, each with one focus: security and
permissions; whether the documents tell the truth and cover the design; money, concurrency
and recovery. They wrote proof-of-concept scripts against throwaway databases. Their
findings and what was done:

| Finding | Outcome |
| --- | --- |
| An invitation or reset link kept working after the account's role changed, so an admin could end up with an owner account | Fixed: links record who made them and only work while that person may still manage the account as it is now; role changes and deactivation end the account's links |
| Links made by a removed admin kept working | Fixed by the same check |
| A retried request got its stored answer before permissions were checked again | Fixed: permission is checked inside the transaction on every call |
| A benefit request was not tied to the price the member saw | Fixed: the shown price is sent and a changed price is refused |
| An amount could be read in the wrong unit if the reward type changed at the same moment | Fixed: the unit travels with the amount and is checked in the transaction |
| Restoring upgraded the copy, which broke rolling back | Fixed: a restore keeps the backup's version; checks are now full integrity and reference checks; copies of a running database are refused |
| Owner recovery did not lift the sign-in lock, and a "server busy" answer counted as a failed sign-in | Fixed; IPv6 clients are also limited per /64 now |
| Retrying after closing and reopening a dialog could record twice; adding a benefit had no retry protection | Fixed, with browser tests that drop the server's answer |
| The role picker saved on every arrow key | Replaced by a dialog with a confirm button |
| The setup code could not be read by the container unless the host user id was 1000 | Changed so no ownership change is needed — **not verified with Docker** |
| Documents: rule-lock wording, rollback order, moving servers, CI claims, settings table and more | Corrected |
| Smaller items: bad `mailto:` gave a server error, text-direction characters in names, check order, unknown query parameters, CSV export from other sites, focus after page changes, button descriptions, "show more" errors, admin cancel, comma as decimal mark | Fixed |

A fourth agent then checked those fixes at `136b787`, re-ran every suite on a clean export
and probed each claim. It confirmed nine findings fixed and one fixed as far as possible
without Docker, and found one only partly fixed plus new problems, all fixed in `29ebc8d`:

| Finding | Outcome |
| --- | --- |
| A link refused because its maker lost their rights stayed "unused": it passed the cheap check, cost a full password hash on every try (enough to keep sign-in busy), and worked again if the maker was reinstated | Fixed: deactivation and demotion end the links that person made; the cheap check makes the same test as using a link |
| The documented way to put a backup kept elsewhere back into Docker failed now that backups are owner-only | Fixed in OPERATIONS.md, and the container drill now does it — **not verified with Docker** |
| A retry answered from storage looked like a new change on screen; a proxy's 502/504 dropped the retry key | Fixed: the server marks stored answers and the page says "already recorded"; keys are kept on anything but a 4xx |
| Invisible direction-control and byte-order characters were written literally in the source | Rewritten as escapes; a new test keeps such characters out |
| Smaller: the setup-code file under a strict umask, a restore's temporary file briefly as readable as its source, NAT64 clients sharing one sign-in limit, no browser test for a price change, `crumb:local` hard-coded in the runbook | Fixed |
| Databases created on this branch before `55a9843` lack a column the changed first migration now has | Not changed: the migration has never been released. Such development databases must be recreated. |

Left for the maintainer to decide (documented as limits below): the account lock design,
managers rewarding themselves, anonymous sessions, the loopback port under HTTPS, invitation
links in browser history, password screening, and the "about thirty people" statement in
the README.

## Where this differs from the plan

- **The first migration was edited in place** (it is unreleased): default times for sessions
  and links, and the column recording who made a link.
- **API additions:** reward amounts and benefit prices carry the unit they were typed in
  (`mode`); a benefit request carries the price shown (`expectedCostUnits`); adding a benefit
  needs an `Idempotency-Key`; stored answers carry `Idempotent-Replayed: true`;
  `GET /api/session` also returns `version` and `origin`.
- **Restore keeps the backup's database version** instead of upgrading it, and refuses copies
  of a running database (`SOURCE_IN_USE`).
- **Files:** the database and backups are created owner-only; the setup code is a readable
  file inside a closed folder rather than an owner-only file handed to user id 1000.
- **Compose:** `init-secrets --origin` writes `COMPOSE_FILE`, the image name can be set with
  `CRUMB_IMAGE`, and the CI drill uses its own tag. Installs skip package scripts
  (`.npmrc`), so nothing is compiled and the image has no build tools.
- **Sign-in:** an attempt the server was too busy to check does not count; IPv6 clients are
  counted per /64 and NAT64 clients by their IPv4 address.
- **Input:** a comma works as the decimal mark; names and messages refuse text-direction
  controls; the CSV export only starts from Crumb's own pages.
- **Screens:** roles change through a dialog; admins can cancel a request; the settings page
  says which rule is fixed; a page opened at the wrong address says where to go.
- **Documents:** the README shows three screenshots; its "validated every release" sentence
  was scoped to the original bakery tool, for the maintainer to confirm.

## Not verified

- **Docker:** building the image, `docker compose config` and `up`, the container health
  check, the non-root user, volumes, the container drill, and copying a kept backup back into
  the backups volume as OPERATIONS.md describes.
- **HTTPS:** Caddy on a real domain, certificate issuance and renewal, `TRUST_PROXY` behind
  it, and Compose picking up `COMPOSE_FILE` and `COMPOSE_PATH_SEPARATOR` from `.env`.
- **File permissions:** the owner-only database and backup files, the setup-code folder and
  file (also under a strict umask) are tested only on Linux or macOS; those two tests are
  skipped on Windows, so they run for the first time in CI. That a restore's temporary file
  is private while it is being written is not tested at all.
- **Retry keys after a proxy error:** that the page keeps its key after a 502 or 504 is
  covered only by reading the code; the browser tests drop the connection instead.
- **Operating systems and hardware:** Linux and macOS hosts, arm64, the 1 GB memory sizing,
  Node 24.21 in the image, and the no-Docker path on a Linux server.
- **Browsers and assistive technology:** only Chromium was used; no Firefox, Safari or
  mobile browsers; no real screen reader.
- **Stopping:** a graceful shutdown on SIGTERM (Windows cannot send it the same way).
- **Links that only work after merging:** the demo's "Deploy it for your team" link, the
  operations-guide link in Settings and the pull-request template link point at `main`.
- **The fallback for file systems without hard links** in backup and restore, and a temporary
  file that cannot be deleted afterwards (for example, held by a virus scanner).
- **A human review and a professional security audit.**

## Known limits of 0.1

- Five failed sign-ins lock an account for 15 minutes even with the right password, and
  anyone who knows a username can trigger it. Owner recovery on the server lifts it for an
  owner; for others it expires.
- Every visit without a cookie creates a short-lived anonymous session row (30 minutes).
- Owners and admins can reward themselves and confirm their own requests. The activity log
  records who did what.
- Passwords are checked for length (12 to 128 characters) only, not against lists of common
  passwords.
- With the HTTPS overlay, the app port stays published on the server's loopback address.
- A browser may keep an opened invitation link in its history until the link is used or
  expires, even though the page removes it from the address bar.
