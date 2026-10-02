# Validation report

What has been checked for Crumb 0.2.0, how, where — and what has **not** been checked.
Nothing here is marked as passing unless it was actually run. The per-requirement view is in
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).

This report covers 0.1 and the one-page round (branch `feature/one-page`, designed in
[the one-page design](superpowers/specs/2026-09-29-crumb-one-page-design.md)): one member
page, self-recorded or confirmed spending, treats to several people at once, corrections of
self-recorded entries, benefit icons, the Team and Settings pages, the one-line header, the
animations, and migration 002. The one-page round is released as Crumb 0.2.0 and moves the
database to schema 2; "0.1" here means the earlier release, commit `643e237`, with its
database at schema 1. Until its version was set to 0.2.0, late in development, the branch
carried the version number 0.1.0; the runs made with it are named under "Earlier runs during
development" below.

## In short

- **Checked on one Windows computer:** every unit, API, concurrency and browser test (in
  Chromium) and the operations drill with real server processes, from a fresh clone of the
  branch, including the one-page round, its review fixes, the four decisions taken after the
  review and the sign-out fix.
- **Checked in CI** (GitHub Actions, Linux), for 0.1 only: the same tests with
  none skipped, and the container drill — the Docker image was built and taken through setup,
  restart, backup, restore into a new volume, owner recovery and rollback. **CI has not run on
  the one-page round:** the branch has not been pushed.
- **Checked by hand on one iPhone:** signing in by QR code with the camera and through
  WeChat, and the home-screen icon (see "Real phone check").
- **Not checked:** HTTPS through Caddy on a real domain (only its Compose configuration was
  validated), arm64, Docker Desktop, Android phones, and browsers other than Chromium apart
  from that one iPhone. For the one-page round also: CI and the container drill, upgrading a
  real deployment of 0.1 (migration 002 ran only on schema 1 files the tests build), and any
  real phone.
- **Reviewed by AI only:** seven review passes (six by Claude agents, one by ChatGPT). No human
  review and no professional security audit has happened yet, of 0.1 or of the one-page
  round.
- So Crumb 0.2.0 is **not yet validated for managing a real team's benefits.** What is still
  needed is at the end of the checklist.

## Environment

| | Local | CI |
| --- | --- | --- |
| Commit | The development branch `feature/one-page`, from a fresh clone, after the review fixes, the four decisions taken after the review and the sign-out fix (see "Results from a fresh clone (local)"). The commit cloned was `2ddc69b` ("fix: sign-out counts only once the server confirms it"), the sign-out fix on top of the squashed release commit `1421aa2` ("Crumb 0.2.0"). The previous record, a fresh clone of `1421aa2`, is kept below. Earlier runs during development, before the branch history was squashed into the 0.2.0 commit, are listed under "Earlier runs during development". | `67a174b`, [run 36412250215](https://github.com/bellaaaaxu/crumb/actions/runs/36412250215) (0.1; not run on `feature/one-page`) |
| Date | 2026-10-01 (the fresh clone of `2ddc69b`, and the previous one of `1421aa2`); 2026-09-30 and 2026-10-01 (the earlier runs during development) | 2026-09-28 |
| Machine | Windows 11 Pro 10.0.26200 | GitHub Actions `ubuntu-24.04` (image 20260920.314.1), x64 |
| Node.js | 24.14.0, npm 11.9.0 | 24.14.0 for the tests; 24.21.0 inside the image |
| SQLite, images | 3.53.4 (better-sqlite3 13.0.3); sharp 0.35.5 with libvips 8.18.7 | the same packages |
| Browser | Chromium 153.0.8010.12 (Playwright 1.63.0) | the same |
| Docker | **not installed** | the runner's Docker Engine and Compose |

## Results from a fresh clone (local)

A new clone of the development branch `feature/one-page`, after the review fixes, the four
decisions taken after the review and the sign-out fix, into an empty temporary folder, with no
files carried over (deleted afterwards), on 2026-10-01, on the computer and with the versions
under "Environment". Its code is the code of this release; only this report and the release
checklist have changed since. The commit cloned was `2ddc69b` ("fix: sign-out counts only
once the server confirms it"), the sign-out fix on top of the squashed release commit
`1421aa2` ("Crumb 0.2.0"). The earlier runs listed under "Earlier runs during development"
were all made on the development branch before it was squashed; the squash itself changed no
code.

| Step | Command | Result |
| --- | --- | --- |
| Install the locked dependencies | `npm ci` | passed — 84 packages, nothing compiled (see `.npmrc`) |
| Unit, API, concurrency and operations tests | `npm test` | 229 tests: 227 passed, **2 skipped** (file permissions and umask, which Windows does not have; both passed in CI for 0.1) |
| Collectible manifest | `node scripts/theme-manifest.mjs --check` | current (39 collectibles) |
| Operations drill with real server processes | `node scripts/ci/process-drill.mjs` | 20 of 20 checks passed |
| Browser | `npx playwright install chromium` | installed |
| Browser tests | `npm run test:e2e -- --project=chromium` | 81 of 81 passed (Chromium only) |
| Whitespace in the change | `git diff --check 643e237..HEAD` (since 0.1) | clean |
| Anything with Docker | | **not run here** (no Docker), and not in CI either for this round — see below |

The four decisions taken after the review and the sign-out fix, each with its own section
below, are all in this run:

| Decision | Checked by |
| --- | --- |
| Request keys cleared at sign-out and whenever the signed-in person changes | `tests/pending.test.mjs`; the three request-key browser tests in `tests/e2e/one-page.spec.mjs` |
| Admins read "Who did what" at the bottom of the Team page; owners in Settings | `tests/api.test.mjs`; the browser tests for admins and owners |
| "Almost there" only when the member is short by more than nothing and at most half the price | `tests/units.test.mjs` (`isAlmostThere`); a browser test at $0.00, $1.00 and $3.00 against $1.00, $4.50 and $12.50 benefits |
| Released as version 0.2.0 | `tests/docs.test.mjs`, `tests/auth.test.mjs`; the footer in the retaken screenshots, by eye |
| Sign-out counts only once the server confirms it | the six sign-out browser tests in `tests/e2e/one-page.spec.mjs` (see "Sign-out confirmed by the server") |

### Previous record: the fresh clone of `1421aa2`

Before the sign-out fix, a fresh clone of `1421aa2` ("Crumb 0.2.0"), the squashed release
commit, was made the same way on 2026-10-01, on the same computer with the same versions. It
covered the release before the sign-out fix: `npm ci` passed (84 packages); `npm test` 229
tests, 227 passed and 2 skipped (the same two); the collectible manifest current; the
operations drill 20 of 20; browser tests 75 of 75 (Chromium only); `git diff --check
643e237..HEAD` clean. A fresh clone of the development branch made earlier that day, before
its history was squashed and on the same code, gave the same counts.

### Earlier runs during development

During development, before the branch history was squashed into the 0.2.0 commit, seven
earlier runs were recorded as the round grew, all on the same computer and none of them in CI.
Each covered part of what the fresh clone above covers. The runs in the development folder
used the dependencies already installed there. All but the last were made while the branch
still carried the version number 0.1.0.

| Date | Where | New since the run before | `npm test` | Browser tests | Manifest and drill |
| --- | --- | --- | --- | --- | --- |
| 2026-09-30 | Fresh clone | The one-page round, before the review fixes | 215 tests: 213 passed, 2 skipped | 64 of 64 | current; 20 of 20 |
| 2026-09-30 | Development folder | The review fixes | 221 tests: 219 passed, 2 skipped | 70 of 70 | current; 20 of 20 |
| 2026-09-30 | Fresh clone | Documents only: the review fixes again, from a new clone | 221 tests: 219 passed, 2 skipped | 70 of 70 | current; 20 of 20 |
| 2026-09-30 | Development folder | Request keys removed at sign-out | 225 tests: 223 passed, 2 skipped | 71 of 71 | not run again |
| 2026-10-01 | Development folder | A browser test for each place request keys leave the browser | 225 tests: 223 passed, 2 skipped | 73 of 73 | not run again |
| 2026-10-01 | Development folder | The activity log for admins | 226 tests: 224 passed, 2 skipped | 74 of 74 | not run again |
| 2026-10-01 | Development folder | "Almost there" only within half the price, and version 0.2.0 | 229 tests: 227 passed, 2 skipped | 75 of 75 | not run again |

In every run the two skipped tests were the same two (file permissions and umask), the
browser tests ran in Chromium only, and the whitespace check (`git diff --check 643e237..HEAD`)
was clean. Between the first fresh clone and the review fixes nothing changed that the app or
the tests run: only documents, and `scripts/screenshots.mjs`, which now waits for the member
page to come to rest instead of for a set time (it was run again into a temporary folder; the
screenshots in the repository were not retaken then). After the last of these runs, only
documents and the README's member and keypad screenshots changed before the fresh clone.

### The review fixes

A review of the round led to these fixes. In the app: taking back one treat of a batch puts
the keyboard back on the reopened batch; the name menu closes when the keyboard moves out of
it; the member log's header shows its whole focus ring; the old `#/team/activity` address
opens Settings for an owner. In the tests: the ones listed under "Tests shown to catch the bug
they are for" below, and a browser check that every stop on the member page shows its whole
focus ring. They were run first in the development folder and then from a fresh clone, with
the same counts (see "Earlier runs during development").

### Request keys at sign-out

Decided after the review: signing out removes the person's request keys from the browser, and
each time the page learns who is signed in only that person's stay, none when no one is. After
the review of that change, each place the page removes keys got a browser test of its own, and
the deployment guide and the design were made exact about what an entry holds and when an old
one goes. Both steps were run in the development folder, not from a fresh clone and not in CI,
before the fresh clone above (see "Earlier runs during development").

### The activity log for admins

Decided after the review: admins, who cannot open Settings, read the activity log ("Who did
what"), read-only, at the bottom of the Team page; owners read it in Settings only. Run in the
development folder, not from a fresh clone and not in CI, before the fresh clone above (see
"Earlier runs during development").

A scratch script also drove the sample team (`scripts/demo.mjs`) in Chromium at 390 px and
1280 px: an admin's Team page ends with the list, and "Show more" pages on; the owner's Team
page neither shows nor asks for it, and their Settings still shows it; a team member is sent
to their own page. No sideways scrolling, console errors or CSP violations.

### Version 0.2.0

Decided after the review: the one-page round is released as Crumb 0.2.0. The version is set
in `package.json` and in both root fields of `package-lock.json` (the footer and
`GET /api/session` report it), with a test that keeps the lock file on it; the guides and the
READMEs say 0.2, with a test that keeps both READMEs' contents heading and status line on it;
and the README's member and keypad screenshots were retaken. Run in the development folder,
not from a fresh clone and not in CI, before the fresh clone above. That run also covered
"Almost there" only when the member is short by at most half a benefit's price, which had no
run of its own (see "Earlier runs during development").

Both new tests were seen failing first: the lock file test with only `package.json` changed,
and the README test on the old heading "What is in this version". `scripts/screenshots.mjs`,
run on the real app once the version was 0.2.0, drew the member page's footer as "Crumb 0.2.0
is open-source software (MIT)."; its picture of the Team page came out the same as before and
was not changed.

Run again just before the fresh clone, the script drew the same footer on the member and
keypad screenshots, which are the ones this release carries; their pastries differ from the
earlier take only because each run gives the sample team new account ids and a member's shelf
fills in an order that follows their id, and the Team page again came out the same. These
sections were then run together from the fresh clone of `1421aa2` (see "Previous record"),
with the manifest check and the operations drill included, and again in the fresh clone of
`2ddc69b`, with the counts at the top of "Results from a fresh clone (local)".

### Sign-out confirmed by the server

A sign-out now counts only once the server confirms that the browser's session is over (see
§16 of [the one-page design](superpowers/specs/2026-09-29-crumb-one-page-design.md) and
DEPLOYMENT.md). Until then nothing in the browser is cleared and the page stays signed in and
says the sign-out did not go through; one sign-out runs at a time, and one with no answer
within ten seconds counts as not done. Six browser tests in `tests/e2e/one-page.spec.mjs`
check it, in Chromium only:

- a member whose sign-out never reaches Crumb stays signed in, is told so, and signs out on
  the next try;
- an owner whose sign-out Crumb cannot take at that moment (a server error) stays signed in,
  is told so, and signs out on the next try;
- a sign-out Crumb confirmed shows the sign-in page even when no answer comes to who is
  signed in now;
- a sign-out from a tab whose session the same member replaced in another tab still ends the
  browser's session;
- a sign-out from a tab whose session someone else replaced leaves that person signed in;
- a sign-out Crumb never answers is let go within the time limit, runs one at a time, and
  its late answer ends no one's session.

`npm test` has no new tests for it (229, as before). Run in the development folder before
`2ddc69b` was committed (`npm test` 227 passed and 2 skipped of 229, browser tests 81 of 81),
then from the fresh clone of `2ddc69b` above; not in CI and not on a real phone.

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
there, not recorded here. The one-page round has had **no CI run**: `feature/one-page` has not
been pushed, so neither the Linux test job (with the two file-permission tests) nor the
container drill has run on it.

## What the tests cover

| Area | Where | Notes |
| --- | --- | --- |
| Exact amounts, both units, input limits | `tests/units.test.mjs`, `tests/ledger.test.mjs` | Server and browser parsers are checked against each other on the same inputs. |
| Ledger, revokes, refunds, retries | `tests/ledger.test.mjs`, `tests/redemptions.test.mjs`, `tests/api.test.mjs` | Append-only rows enforced by the database itself (`tests/db.test.mjs`). |
| Two devices at once | `tests/concurrency.test.mjs` | Worker threads with separate database connections: overspending, the same request twice, deactivation racing a request; since the review fixes also two self-recorded entries against one balance, an entry racing the confirmation of a request left waiting, and two corrections of one entry, five rounds each. |
| Roles, sessions, sign-in limits, CSRF, links | `tests/auth.test.mjs`, `tests/members.test.mjs`, `tests/permissions.test.mjs`, `tests/api.test.mjs` | Includes the link-takeover and replay cases found in review, and team members' sign-in links: one use, 7 days, one device at a time, a new link or a role change signing them out, two uses of one link at the same moment, and owner and admin sessions never lasting past 12 hours. |
| Retry keys in the browser | `tests/pending.test.mjs`, `tests/e2e/one-page.spec.mjs` | Kept across a reload, per person, dropped on an answer, expiring, capped, working when storage is blocked, storing a fingerprint and never the change itself. Forgotten for a person who signs out, and for everyone but the person signed in (all of them when no one is), leaving no expired or unreadable entry behind, also with storage full or blocked. In the browser: a member's entry whose answer never arrives leaves a key in `crumb.pending`, and none of the member's keys is left after they sign out, also when the page then gets no answer to who is signed in now, or after the server ends their session (a new sign-in link) once the page reloads. |
| Settings, logo upload, CSV export | `tests/org.test.mjs`, `tests/csv.test.mjs` | Upload limits and re-encoding, formula-safe CSV, export only from Crumb's own pages. |
| Backup, restore, owner recovery | `tests/backup.test.mjs`, `tests/ops.test.mjs`, the drills | See the record below. |
| Member and team journeys | `tests/e2e/product.spec.mjs` | Credit and points, two browser contexts as two devices, a team member joining with a sign-in link and a new link signing the old phone out, an admin joining with a password, deactivation, settings in Chinese; answers lost, cut short, or lost and followed by a reload. For sign-in links also: signing out, a used link opened again, a tap whose answer is cut short or lost, and a link page replaced while it loads. |
| Phone and laptop layout, keyboard, reduced motion, HTML-looking input | `tests/e2e/accessibility.spec.mjs` | 390 px and 1440 px widths, no sideways scrolling, no CSP violations: the member page in both spending modes, the keypad, the Team page with a batch opened, the treat dialog, Settings, and the name menu at 390 px. Every stop on the member page at 390 px shows its whole focus ring; tabbing out of the name menu closes it. |
| Self-recorded spending and corrections | `tests/spending.test.mjs`, `tests/api.test.mjs`, `tests/csv.test.mjs`, `tests/e2e/one-page.spec.mjs` | An entry needs a positive amount within the available balance, in the current unit, whole in points; refused in confirmed mode and for inactive accounts; a retry is recorded once; the shelf never changes. A manager corrects an entry once, with a reason; the amount comes back and nothing unlocks. Both kinds export to CSV. In the browser: an entry changes the big number and the log, more than the balance cannot be confirmed, and the owner corrects an entry from the Team log, which the member then sees. |
| Spending modes | `tests/org.test.mjs`, `tests/redemptions.test.mjs`, `tests/e2e/one-page.spec.mjs` | Defaults to self-recorded, chosen at setup, changed by owners only and at any time; requests only in confirmed mode; switching changes both pages; a request left waiting by a switch still shows and can be confirmed. |
| Treats to several people | `tests/batch.test.mjs`, `tests/api.test.mjs`, `tests/e2e/one-page.spec.mjs` | One row, one unlock and one audit row per person with one batch id; all or nothing; a single treat beside batches; every Team log row carries its batch's size and `?batchId=` lists one batch. In the browser: three people from the dialog fold into one log line, and a batch of 25 whose rows run past the first page of the log stays one line that opens to all 25, each with their own "Take back". |
| Benefit icons | `tests/redemptions.test.mjs`, `tests/api.test.mjs`, `tests/db.test.mjs`, `tests/e2e/one-page.spec.mjs` | A theme key or none; an edit without an icon keeps it; the icon is part of the request a key stands for; managers get the theme's names in every language. In the browser: a pastry picked in "Add a benefit", named in the interface's language, is drawn on the Team page and on the member's list. |
| Migration 002 | `tests/db.test.mjs` | Unit tests build a real schema 1 database file from `001-initial.sql` and open it with the current code: the ledger keeps its rows, sums and rowids, every index and trigger is there, the new kinds and the sign rules hold, a team with benefits comes up in confirmed mode, an update that would leave a reference to a missing row is refused and changes nothing, and a database already up to date opens with a stray old row in it. |
| The one-page member view, the Team page and the header | `tests/e2e/one-page.spec.mjs`, `tests/e2e/product.spec.mjs` | The latest five log rows, everything by month with "Show more", folding back; one level-1 heading in both modes; a person's row opening to their actions and open again after a change, and a batch open again after one of its treats is taken back, each with the keyboard on it; the old sub-page addresses landing on the page that now holds them; on a phone a one-line header whose name menu holds the pages, the language and signing out, and on a wide screen the pills; a team member has no navigation. |
| The intro and the animations | `tests/e2e/one-page.spec.mjs` | The intro is skipped with a tap (the page's clock held still, so only the tap can end it); with reduced motion no intro shows and no pastry drops, and without it the pastries do drop. |
| Last-seen numbers in the browser | `tests/e2e/one-page.spec.mjs` | `crumb.seen.<user id>` is there for the signed-in member, and gone after they sign out, and after the server ends their session (a new sign-in link) once the page reloads. A treat that came in since the last look is announced ("Someone treated you"), also one that arrives while the page is open and is found by the reading after an entry; the member's own entries are not. |
| QR codes and the home-screen icon | `tests/qr.test.mjs`, `tests/members.test.mjs`, `tests/home-screen.test.mjs`, `tests/e2e/product.spec.mjs` | Every kind of link, on every panel, comes with a QR code that reads back as exactly that link (decoded with jsqr, dark on light only), with a white border four modules wide; a saved or shared picture does too; Save is always there, Share only where the system offers it, and a failed share saves instead; a missing, odd or non-PNG picture leaves the link alone; the home-screen tip shows for team members only (not owners or admins), until dismissed in that browser, also with storage blocked, and never inside a home-screen app; inside WeChat the link stays in the address until used or left; the notes on the link page are read with its button; the iPhone-app note shows only in an iPhone home-screen app; the manifest opens in the browser and the icons are PNGs of the right sizes. |
| The demo command and static hosting | `tests/demo.test.mjs`, `tests/e2e/static-host.spec.mjs` | `npm run demo` starts the invented English team and prints how to sign in (that it deletes its data on Ctrl+C is checked on Linux only: Windows cannot send it that signal from a test); the app folder served as static files under `/crumb/`, as GitHub Pages does, finds every file it asks for and says it needs its own server, with links to the demo and the README. |
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
- After the sixth review: letting a team member make sign-in links, leaving the browser's
  earlier session in place, turning that session into the member's, and letting a sign-in
  link work for an owner or admin each made a server test fail. In the browser, each of these
  made its own test fail: a late answer painting over a newer link page, hiding "New sign-in
  link" from admins or showing it for someone deactivated, not asking the server again after
  a failed tap, treating a used link on a signed-in phone as an error, signing a member out
  without asking, and making a new link without asking.
- After the seventh review, 21 changes each made a test fail: no white border, light-on-dark
  codes, a QR failure not logged or logged with the link, the tip dismissed only for one tab,
  shown to admins or crashing with storage blocked or shown in an app window, the shape check
  removed, an odd picture breaking the panel, no QR on the reset or renewed-invitation panel,
  Save hidden where sharing works, a failed share not saving, a closed share sheet saving,
  focus lost after "Got it" or "Done", the iPhone note in every app window, the WeChat address
  wiped at once or kept after leaving, and the WeChat note not read with the button.
- After the review of the one-page round, each new server test failed on a copy of the code
  with the check it guards removed or weakened: a self-recorded entry's balance check moved out
  of its transaction (the two-device race), the check reading the posted balance instead of the
  available one (the race with a confirmation), the correction check moved out of its
  transaction (two corrections at once), the batch's unit check, amount check and ceiling
  (either half), a correction's ceiling, `/api/me/spend` rounding a points amount down, the
  icon left out of a new benefit's request key, a column default other than self-recorded, and
  a daily-line count, a ledger kind or a request status with no string. In the browser, the
  treat toast removed or forgotten after an entry, the icon not sent, and the icon not drawn on
  the member's list each made their test fail; the batch focus, the menu closing, the focus
  ring and the old activity address each failed before their fix.
- Request keys at sign-out: before the change, the browser test still found the member's key
  in `crumb.pending` after they signed out. Leaving the browser's copy in place when nothing is
  left or the shorter list will not fit, and writing nothing when nothing is left, each made two
  unit tests fail. After the review of that change, a browser test was added for each of the
  two places the page removes keys: with the removal on load (`keepPendingOnlyFor` in
  `loadSession`) taken out, the test with the server ending the session failed, and with the
  sign-out's own removal (`forgetPendingFor` in `signOut`) taken out, the test with no answer
  after signing out failed; the other request-key browser tests passed both times.
- Every problem found in review got a test first, and each was seen failing for the reported
  reason before the fix (for example, restoring with a copy of the code that has one more
  migration reproduced the reported "schema too new" failure).

## Real phone check

On 2026-09-29 the QR codes were tried by hand on one iPhone, against a temporary Crumb
(commit `8523d47`, invented data) running on a computer on the same network:

- scanned the code on the computer screen with the iPhone camera, signed in with one tap,
  added Crumb to the home screen, and opened it from the icon still signed in;
- scanned a new code with WeChat, followed the note to open it in the browser, and signed in
  there.

Both passed. Not recorded: the iOS version, whether "Open as Web
App" was offered when adding the icon, and what WeChat calls its menu item. No Android phone
was tried, and a picture opened with a long press was not tried separately from scanning.

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

A sixth review, by a Claude agent at `0e321bb`, looked only at the change to sign-in links. It
found nothing critical: checking and claiming a link is one transaction, links are stored as
hashes and checked again when used, and the 12-hour limit for owners and admins held under
every probe. Most findings below were shown by running probes against throwaway servers; the
rest came from reading the code:

| Finding | Outcome |
| --- | --- |
| Two server tests meant to show that team members are refused passed for the wrong reason (the member had just been signed out), and nothing stopped a team member making sign-in links | Fixed: the tests keep the member signed in and check the refusal code; a member asking for a sign-in link, for someone else or themselves, is tested |
| No test showed that a sign-in link replaces the browser's earlier session instead of upgrading it | Added, including an owner signed in on the same browser; the earlier session now ends in the same transaction that uses the link |
| A team member who signs out cannot get back in without a new link | The page asks first and says why; documented |
| The link page never checked whether the browser was already signed in: after a lost or cut-short answer, or when a used link was tapped again, it sent members to ask for a new link | Fixed: after anything but a clear answer the page asks the server who is signed in and goes straight in; a used link on a signed-in phone opens Crumb; a lost answer is explained without promising a safe retry |
| Using a link after joining left nothing in the activity log | Every use is logged, as the member |
| After a failed tap, focus was lost and a button that could no longer work stayed | Replaced by the explanation and "Go to sign in", focused |
| Several messages did not say what the person needs next (a role change between admin and owner, reactivating a team member) or said "signed out" of someone who never signed in | Fixed; the note after a new link uses the server's current answer, since the list on screen may be older |
| "New sign-in link" signed a member out everywhere in one tap | It asks first, like deactivating |
| An owner can manage their own account through the API (make themselves a reset link, or step down while another owner remains) | Not changed: the design only forbids removing the last active owner, and the server lets one of two owners leave on purpose (tested); the screens never offer it |
| A late answer could paint over a newer page | Checked again after every wait; tested |
| Documents: opening a link does not sign in, the tap does; each browser counts as its own device; a member who never joined and is made an admin needs an invitation, not a reset; the design's §4 still said everyone uses a password | Corrected; the design now points to the 2026-09-29 decision |

A seventh review, by a Claude agent at `367cb9c`, looked at the QR codes and the home screen.
It found nothing critical — 600 random links across ten kinds of address read back exactly,
and no token reaches a log or another origin — and these, proven by running them unless
marked:

| Finding | Outcome |
| --- | --- |
| Desktop Edge and Chrome on Windows can share files, so a computer got only "Share QR code", never "Save" | Save is always offered; Share is added where the system offers it, and a failed share saves instead |
| Inside WeChat the page had already wiped the link from the address, so "Open in Browser" would open a page no team member can use | Inside WeChat the link stays in the address until it is used or left; which address WeChat hands over is still to be checked on a real phone |
| The records said the fresh-clone run and the review were recorded before they were | Recorded here, for the final commit |
| Nine rules could break with every test passing (the white border, dark on light, the tip for admins, in another tab, with storage blocked or in an app window, the shape check, the reset and invitation panels, a missing picture) | Tests added; each shown to catch its change |
| A picture that passes the shape check but does not decode took the whole panel down | The panel shows the link alone |
| Focus was lost after "Got it" and "Done" | Focus goes to the page |
| The iPhone note also showed in desktop app windows, which share the browser's sign-in, and spoke to owners | Only in an iPhone home-screen app, addressed to team members |
| (Reading) Share failures were silent; a QR failure left no trace; the WeChat note was not read with the button | A failed share saves; the failure is logged by type only; the notes describe the button |
| (Reading) Documents: "neither goes to any outside service" beside advice to send it by chat; "the first time" for a tip shown until dismissed; the DOM helper comment | Reworded |

Decided on 2026-09-28: request keys stay in the browser as described below, and two
unconfirmed statements about the original tool were removed from the README. Still to decide
(documented as limits below): the account lock design, managers rewarding themselves,
anonymous sessions, the loopback port under HTTPS, invitation links in browser history and
password screening.

## Where this differs from the design

- **The first migration was edited in place** (it is unreleased): default times for sessions
  and links, and the column recording who made a link.
- **API additions:** reward amounts and benefit prices carry the unit they were typed in
  (`mode`); a benefit request carries the price shown (`expectedCostUnits`); adding a benefit
  needs an `Idempotency-Key`; stored answers carry `Idempotent-Replayed: true`;
  `GET /api/session` also returns `version` and `origin`.
- **Browser storage:** besides the language, `localStorage` now holds request keys for
  changes whose answer never arrived (`crumb.pending`) — per signed-in person, a random key, a
  SHA-256 fingerprint of the change, its kind and a time. The design allowed `localStorage`
  only for the demo and non-sensitive interface preferences; this change was decided on
  2026-09-28. The keys and the fingerprint of each unanswered change stay in this browser
  until an answer arrives and are used for at most seven days (an older one is deleted the
  next time Crumb is opened in this browser); they are removed when the person signs out or
  someone else signs in on this browser (as for the last-seen numbers below). The
  fingerprint holds no change in plain text, but the fingerprint of a small change, such as an
  amount, could be worked out by someone using the same browser before then. Removing them at
  sign-out was decided after the review of the one-page round.
  It also remembers, per browser, that a team member dismissed the home-screen tip (an
  interface preference). Since the one-page round it keeps a fourth thing (`app/motion.js`,
  `crumb.seen.<user id>`): for the person signed in on that browser only, the balance, pastry
  count and total received they last saw, so the page can roll the number on from there. It
  is removed when they sign out, and whenever the page finds no one, or someone else, signed
  in there (a new sign-in link, a deactivation, an expired session), also on the next load.
- **The one-page round:** where the build differs from its own approved design is listed in
  §16 of [the one-page design](superpowers/specs/2026-09-29-crumb-one-page-design.md).
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
  the original tool or that every release of it was validated (neither could be confirmed).
- **How team members sign in (decided on 2026-09-29):** the design (§4) has everyone sign in
  with a username and password. Team members now sign in with a personal link an admin makes: it works
  once, within 7 days; the device then stays signed in for up to 180 days; a member is signed
  in on one device at a time, and a new link signs the old device out. Owners and admins keep
  passwords and 12-hour sessions. New endpoints: `POST /api/admin/members/:id/signin-link`,
  `POST /api/signin/preview` and `POST /api/signin/accept`; `POST /api/admin/invitations`
  returns `signinUrl` for a team member, and the sign-in link endpoint also returns the member
  as they are now; the invitation and reset endpoints answer `USE_SIGNIN_LINK` for team
  members, and the sign-in link endpoint `USE_PASSWORD` for owners and admins. The first
  migration gained a `joined_at` column (it is still unreleased). A role change signs the
  person out: a member who had joined and is made an admin chooses a password through a reset
  link (one who never joined gets a new invitation), and an admin made a member loses their
  password. A member is asked before signing out, and an admin before making a new link.
- **QR codes and the home screen (decided on 2026-09-29):** every one-time
  link is shown with its QR code, to scan in person or send as a picture (a phone opens it
  with a long press); the link and "Copy link" stay. The four link endpoints also return
  `qr`, a PNG data URL made on the server. Team members are shown a one-time tip to put Crumb
  on their home screen; a manifest with `display: browser` and PNG icons (made by
  `scripts/make-icons.mjs` from the sprite table) keep that icon in the browser, which holds
  the sign-in. Team member sign-ins stay at a fixed 180 days (decided the same day). New
  dependencies: `uqr` 0.1.3 (MIT) at run time, `jsqr` 1.4.0 (Apache-2.0) in tests only.
- **Before merging (2026-09-29):** `npm run demo` (`scripts/demo.mjs`) opens an invented English
  team for a look around, and the screenshots and the demo share that team
  (`scripts/sample-team.mjs`). The app page uses relative paths and says it needs its own
  server when none answers, because GitHub Pages publishes it at `/crumb/app/`. The design
  documents in `docs/superpowers/specs` are in English, with the Chinese originals beside
  them (`*.zh-CN.md`); implementation plans are not kept in the repository.

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
- **Real phones, beyond one iPhone:** any Android phone; opening a sent picture with a long
  press (the iPhone check scanned instead); the share sheet on a real phone. One iPhone passed
  the camera, home-screen and WeChat checks (see "Real phone check"). Otherwise the tests
  decode the picture with jsqr, stand in for the share sheet, and simulate WeChat and
  home-screen apps by their browser signs.
- **Stopping mid-request:** the container drill's restart stops Crumb with SIGTERM while it is
  idle; stopping it with requests in flight was not tried.
- **Links that only work after merging:** the demo's "Deploy it for your team" link, the
  operations-guide link in Settings and the pull-request template link point at `main`.
- **The fallback for file systems without hard links** in backup and restore, and a temporary
  file that cannot be deleted afterwards (for example, held by a virus scanner).
- **A human review and a professional security audit.**
- **The one-page round in CI:** the Linux test job (where the two file-permission tests run)
  and the container drill have not run on `feature/one-page`; it has not been pushed. Docker
  is not installed on the computer that ran the fresh clone.
- **Upgrading a real deployment of 0.1:** migration 002 has run only on schema 1 database
  files that the unit tests build from `001-initial.sql`, and on new databases, where 001 and
  002 run one after the other. Pulling 0.2 and rebuilding the image over a running instance of
  0.1, as OPERATIONS.md describes, was not tried, with Docker or without.
- **The one-page round on real phones:** the member page, the keypad sheet, the name menu, the
  intro and the animations were checked in Chromium at phone sizes only. How they look and
  feel on a real iPhone or Android phone, including with reduced motion turned on in the
  system settings, was not tried.

## Known limits

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
  needs a new sign-in link. So does a member who signs out, or who opens their link in a
  different browser (a chat app's built-in browser counts as one).
- If the answer to the tap on "Sign in on this device" is lost after the server used the
  link, and the cookie never reached the phone, the link is spent: the page says to ask the
  admin for a new one. (When the cookie did arrive, the page notices and goes straight in.)
- A QR code scanned or long-pressed in WeChat opens in WeChat's own browser. The page says to
  open it in the browser first but does not stop anyone; a sign-in made there stays there.
  Inside WeChat the link stays visible in the address until it is used, so "Open in Browser"
  can carry it over.
- A change sent again from a different browser or device after a lost answer is not
  recognised as a retry: request keys live in the browser that sent the change.
- Signing out removes the person's request keys, so after a lost answer, signing out and
  signing in again, the page no longer says the change was not confirmed, and sending it again
  is a new change. Until then, someone using the same browser could work out a small change,
  such as an amount, from its fingerprint (an entry is used for at most seven days, and
  deleted the next time Crumb is opened after that).
- In self-recorded mode an entry is whatever the member keys in. Crumb records it, shows it to
  admins in the Team log and lets them correct it, but cannot check it against what was taken.
