# Validation report

What has been checked for Crumb 0.1, how, where — and what has **not** been checked. Nothing
here is marked as passing unless it was actually run. The per-requirement view is in
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).

## In short

- **Checked on one Windows computer:** every unit, API, concurrency and browser test (in
  Chromium) and the operations drill with real server processes, from a fresh clone of the
  branch.
- **Checked in CI** (GitHub Actions, Linux): the same tests with none skipped, and the
  container drill — the Docker image was built and taken through setup, restart, backup,
  restore into a new volume, owner recovery and rollback.
- **Not checked:** HTTPS through Caddy on a real domain (only its Compose configuration was
  validated), arm64, Docker Desktop, and browsers other than Chromium.
- **Reviewed by AI only:** five review passes (four by Claude agents, one by ChatGPT). No human
  review and no professional security audit has happened yet.
- So Crumb 0.1 is **not yet validated for managing a real team's benefits.** What is still
  needed is at the end of the checklist.

## Environment

| | Local | CI |
| --- | --- | --- |
| Commit | `96199ea` (fresh clone) | `67a174b`, [run 36412250215](https://github.com/bellaaaaxu/crumb/actions/runs/36412250215) |
| Date | 2026-09-28 | 2026-09-28 |
| Machine | Windows 11 Pro 10.0.26200 | GitHub Actions `ubuntu-24.04` (image 20260920.314.1), x64 |
| Node.js | 24.14.0, npm 11.9.0 | 24.14.0 for the tests; 24.21.0 inside the image |
| SQLite, images | 3.53.4 (better-sqlite3 13.0.3); sharp 0.35.5 with libvips 8.18.7 | the same packages |
| Browser | Chromium 153.0.8010.12 (Playwright 1.63.0) | the same |
| Docker | **not installed** | the runner's Docker Engine and Compose |

The commit after `96199ea` only adds this report and the checklist.

## Results from a fresh clone (local)

A new clone of the branch into an empty temporary folder, with no files carried over:

| Step | Command | Result |
| --- | --- | --- |
| Install the locked dependencies | `npm ci` | passed — nothing compiled (see `.npmrc`) |
| Unit, API, concurrency and operations tests | `npm test` | 164 tests: 162 passed, **2 skipped** (file permissions and umask, which Windows does not have; both pass in CI) |
| Browser tests | `npm run test:e2e` | 30 of 30 passed (Chromium only) |
| Operations drill with real server processes | `node scripts/ci/process-drill.mjs` | 20 of 20 checks passed |
| Collectible manifest | `node scripts/theme-manifest.mjs --check` | current (39 collectibles) |
| Whitespace in the change | `git diff --check 705ae23..HEAD` | clean |
| Anything with Docker | | **not run here** (no Docker) — see CI below |

## Results in CI

For `67a174b`, both jobs passed:

- **Unit, API and browser tests:** `npm test` 158 of 158 with none skipped (the two
  file-permission tests that Windows skips ran and passed); the collectible manifest is
  current; the process drill passed; Playwright 26 of 26.
- **Container build, deployment and recovery drill** (`scripts/ci/container-drill.sh`, 42
  seconds):
  - built the image and validated both Compose configurations (`compose.yaml` alone and with
    `compose.https.yaml`);
  - started it, waited for the health check, and confirmed it runs as user 1000 and contains
    no tests, documents, `.git`, `.env` or `.secrets`;
  - first setup through the API — a second one was refused; a reward and its retry were
    recorded once;
  - a restart kept the data and the sessions;
  - a backup in the running container (schema 1, SHA-256 printed), copied off the server and
    back in as OPERATIONS.md describes;
  - restored into a new volume and switched to it: old sessions were refused, balance and
    collection were intact;
  - owner recovery from the command line lifted the sign-in lock;
  - rolled back to the original volume with the original data and password.

The commits after `67a174b` run the same CI on the pull request; their results are shown
there, not recorded here.

## What the tests cover

| Area | Where | Notes |
| --- | --- | --- |
| Exact amounts, both units, input limits | `tests/units.test.mjs`, `tests/ledger.test.mjs` | Server and browser parsers are checked against each other on the same inputs. |
| Ledger, revokes, refunds, retries | `tests/ledger.test.mjs`, `tests/redemptions.test.mjs`, `tests/api.test.mjs` | Append-only rows enforced by the database itself (`tests/db.test.mjs`). |
| Two devices at once | `tests/concurrency.test.mjs` | Worker threads with separate database connections: overspending, the same request twice, deactivation racing a request. |
| Roles, sessions, sign-in limits, CSRF, links | `tests/auth.test.mjs`, `tests/members.test.mjs`, `tests/permissions.test.mjs`, `tests/api.test.mjs` | Includes the link-takeover and replay cases found in review, and team members' sign-in links: one use, 7 days, one device at a time, a new link or a role change signing them out, two uses of one link at the same moment, and owner and admin sessions never lasting past 12 hours. |
| Retry keys in the browser | `tests/pending.test.mjs` | Kept across a reload, per person, dropped on an answer, expiring, capped, working when storage is blocked, storing no names, amounts or messages. |
| Settings, logo upload, CSV export | `tests/org.test.mjs`, `tests/csv.test.mjs` | Upload limits and re-encoding, formula-safe CSV, export only from Crumb's own pages. |
| Backup, restore, owner recovery | `tests/backup.test.mjs`, `tests/ops.test.mjs`, the drills | See the record below. |
| Member and team journeys | `tests/e2e/product.spec.mjs` | Credit and points, two browser contexts as two devices, a team member joining with a sign-in link and a new link signing the old phone out, an admin joining with a password, deactivation, settings in Chinese; answers lost, cut short, or lost and followed by a reload. |
| Phone and laptop layout, keyboard, reduced motion, HTML-looking input | `tests/e2e/accessibility.spec.mjs` | 390 px and 1440 px widths, no sideways scrolling, no CSP violations. |
| Public demo, documents and source | `tests/e2e/demo.spec.mjs`, `tests/docs.test.mjs`, `tests/source.test.mjs` | Local links and images resolve; no invisible direction or byte-order characters. External links are not fetched by the tests. |

### Tests shown to catch the bug they are for

- Removing the transaction around a benefit request made the overspending test fail 3 of 3
  times.
- Giving every opened dialog a new request key again (the old behaviour) made both
  lost-answer browser tests fail: two rewards, two requests.
- The fifth review's two scenarios — an answer cut short, and a lost answer followed by a
  reload — recorded two rewards before the fix and one after, run with the reviewer's own
  steps.
- Planting one invisible direction-control character in a source file made the source check
  fail.
- Sign-in links: leaving a member's sessions in place when a new link is made, leaving
  sessions in place on a role change, and letting an owner's session last as long as a team
  member's each made its test fail. In the browser, hiding the "you are signed in here as…"
  warning and the message for a used link each made the journey test fail.
- Every problem found in review got a test first, and each was seen failing for the reported
  reason before the fix (for example, restoring with a copy of the code that has one more
  migration reproduced the reported "schema too new" failure).

## Backup and restore record

- **Process drill** (real server processes, a temporary folder, locally and in CI): start,
  first setup, a reward, restart, a backup while the server runs, restore into a new folder,
  start on the restored copy, sign in, compare balance and collection, owner recovery, then
  roll back to the original folder and check it is untouched. 20 of 20 checks passed.
- **Container drill** (CI, Docker volumes): the steps listed above, including copying the
  backup off the server and back in.
- **Tests:** a backup taken while another connection keeps writing is one consistent moment;
  a restore keeps every business table (people, ledger, requests, benefits, collections,
  stored responses, activity log, logo) and clears sessions and links; a restore made by a
  newer version still opens in the older one; damaged files, files with a broken index or
  orphaned rows, copies of a running database and existing targets are refused.
- **Not done:** a restore of a real organization's data. The drills compare balance and
  collection; the full table-by-table comparison is in the tests.

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
| The setup code could not be read by the container unless the host user id was 1000 | Changed so no ownership change is needed; confirmed by the container drill in CI |
| Documents: rule-lock wording, rollback order, moving servers, CI claims, settings table and more | Corrected |
| Smaller items: bad `mailto:` gave a server error, text-direction characters in names, check order, unknown query parameters, CSV export from other sites, focus after page changes, button descriptions, "show more" errors, admin cancel, comma as decimal mark | Fixed |

A fourth agent then checked those fixes at `136b787`, re-ran every suite on a clean export
and probed each claim. It confirmed nine findings fixed and one fixed as far as possible
without Docker, and found one only partly fixed plus new problems, all fixed in `29ebc8d`:

| Finding | Outcome |
| --- | --- |
| A link refused because its maker lost their rights stayed "unused": it passed the cheap check, cost a full password hash on every try (enough to keep sign-in busy), and worked again if the maker was reinstated | Fixed: deactivation and demotion end the links that person made; the cheap check makes the same test as using a link |
| The documented way to put a backup kept elsewhere back into Docker failed now that backups are owner-only | Fixed in OPERATIONS.md; the container drill does it and passed in CI |
| A retry answered from storage looked like a new change on screen; a proxy's 502/504 dropped the retry key | Fixed: the server marks stored answers and the page says "already recorded"; keys are kept on anything but a 4xx |
| Invisible direction-control and byte-order characters were written literally in the source | Rewritten as escapes; a new test keeps such characters out |
| Smaller: the setup-code file under a strict umask, a restore's temporary file briefly as readable as its source, NAT64 clients sharing one sign-in limit, no browser test for a price change, `crumb:local` hard-coded in the runbook | Fixed |
| Databases created on this branch before `55a9843` lack a column the changed first migration now has | Not changed: the migration has never been released. Such development databases must be recreated. |

A fifth review, by ChatGPT on the pull request at `67a174b`, reproduced two ways the same
reward could still be recorded twice, both fixed in `96199ea`:

| Finding | Outcome |
| --- | --- |
| A success whose answer arrived cut short was taken as done, so the page dropped the request key, showed an error, and sending again recorded a second reward | Fixed: an answer that does not arrive whole counts as no answer; the key is kept, and sending again is a retry |
| Request keys lived only in the page, so after a lost answer and a reload the same reward sent again was recorded twice | Fixed: keys for unanswered changes are kept in the browser across reloads, per person; dialogs say when an earlier change was not confirmed. A deliberate second reward is still possible once the first is settled |

Decided by the maintainer on 2026-09-28: request keys stay in the browser as described below,
and the README's two unconfirmed statements about the original tool ("in daily use by about
thirty people", "validated every release before rollout") were removed. Still to decide
(documented as limits below): the account lock design, managers rewarding themselves,
anonymous sessions, the loopback port under HTTPS, invitation links in browser history and
password screening.

## Where this differs from the plan

- **The first migration was edited in place** (it is unreleased): default times for sessions
  and links, and the column recording who made a link.
- **API additions:** reward amounts and benefit prices carry the unit they were typed in
  (`mode`); a benefit request carries the price shown (`expectedCostUnits`); adding a benefit
  needs an `Idempotency-Key`; stored answers carry `Idempotent-Replayed: true`;
  `GET /api/session` also returns `version` and `origin`.
- **Browser storage:** besides the language, `localStorage` now holds request keys for
  changes whose answer never arrived — per signed-in person, a random key, a one-way
  fingerprint of the change, its kind and a time; never names, amounts or messages; gone once
  answered or after seven days. The design allowed `localStorage` only for the demo and
  non-sensitive interface preferences; the maintainer approved this change on 2026-09-28.
- **Incomplete answers:** a success whose body does not arrive whole is treated as no answer
  (`INCOMPLETE_ANSWER`), so the change can be retried safely.
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
- **Documents:** the README shows three screenshots, and no longer says how many people used
  the original tool or that every release of it was validated (the maintainer could not
  confirm either).
- **How team members sign in (decided by the maintainer on 2026-09-29):** the design (§4)
  has everyone sign in with a username and password. The maintainer's original design never
  asked staff for a password, so team members now sign in with a personal link an admin makes: it works
  once, within 7 days; the device then stays signed in for up to 180 days; a member is signed
  in on one device at a time, and a new link signs the old device out. Owners and admins keep
  passwords and 12-hour sessions. New endpoints: `POST /api/admin/members/:id/signin-link`,
  `POST /api/signin/preview` and `POST /api/signin/accept`; `POST /api/admin/invitations`
  returns `signinUrl` for a team member; the invitation and reset endpoints answer
  `USE_SIGNIN_LINK` for team members, and the sign-in link endpoint `USE_PASSWORD` for owners
  and admins. The first migration gained a `joined_at` column (it is still unreleased). A
  role change signs the person out; a member made an admin chooses a password through a reset
  link, and an admin made a member loses theirs.
- **Hand-over:** the plan's last step asks to attach an artifact to the pull request; no
  such tool exists in this environment, so the screenshots are in the pull request's
  description instead.

## Not verified

- **HTTPS:** Caddy on a real domain, certificate issuance and renewal, and `TRUST_PROXY`
  behind it. Only `docker compose -f compose.yaml -f compose.https.yaml config` ran.
- **Compose settings from `.env`:** `COMPOSE_FILE` and `COMPOSE_PATH_SEPARATOR` (the CI drill
  sets `COMPOSE_FILE` in its own environment).
- **The README's local "Try it" exactly as written:** the drill runs the same steps with its
  own project name and image tag, and waits for the health check.
- **Other Docker setups:** Docker Desktop on macOS or Windows, arm64 (CI builds for x64
  only), rootless Docker and SELinux.
- **File permissions on Windows:** the permission tests pass on Linux and are skipped on
  Windows. That a restore's temporary file is private while it is being written is not tested
  at all.
- **Retry keys after a proxy error:** that the page keeps its key after a 502 or 504 is
  covered only by reading the code; the browser tests drop or cut short the answer instead.
- **Browsers and assistive technology:** only Chromium was used; no Firefox, Safari or
  mobile browsers; no real screen reader.
- **Stopping mid-request:** the container drill's restart stops Crumb with SIGTERM while it is
  idle; stopping it with requests in flight was not tried.
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
- A browser may keep an opened invitation or sign-in link in its history until the link is
  used or expires, even though the page removes it from the address bar.
- A sign-in link works for whoever opens it first, like a password sent in a message, so it
  should be sent privately. A team member's device stays signed in for up to 180 days:
  whoever holds that unlocked phone is signed in as them until an admin makes a new link or
  deactivates the account.
- A team member is signed in on one device at a time, and after a restore every team member
  needs a new sign-in link.
- A change sent again from a different browser or device after a lost answer is not
  recognised as a retry: request keys live in the browser that sent the change.
