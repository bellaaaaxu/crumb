# Release checklist — Crumb 0.3.0

One row for each requirement of
[the design behind 0.1](superpowers/specs/2026-09-27-crumb-self-hosted-design.md) and each
acceptance criterion in its section 11, with the evidence behind it; under "The one-page
round", one row for each part of
[the one-page design](superpowers/specs/2026-09-29-crumb-one-page-design.md); and under "The
collection themes round", one row for each part of
[the themes design](superpowers/specs/2026-10-03-crumb-themes-design.md). How and where the
checks ran is in [VALIDATION.md](VALIDATION.md).

The themes round was checked on a fresh clone of the development branch on 2026-10-05, whose
code is the code of this release: the commit cloned was `9849c31`
("docs: the themes spec says it is implemented on feature/themes"). CI has not run on it.
The one-page round, released as 0.2.0, was checked on a fresh clone of `2ddc69b` on 2026-10-01
and in CI on its pull request (`1fb57ee`) and on `main` (`bbfda7f`).

The themes round is released as Crumb 0.3.0 and moves the database to schema 3. "0.2.0" on
this page means the release at merge commit `bbfda7f`, with its database at schema 2; "0.1"
means the first release, commit `643e237`, with its database at schema 1.

**Passed** means an automated check ran and passed in the recorded run. **Partly** means
some of the requirement was checked and the rest was not. **Not verified** means it has not
been run at all — nothing is marked passed on the strength of reading the code. **Reviewed by
eye**, a status of the themes round, means the maintainer was shown it and approved it; no
automated check covers how it looks.

## Design coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| For any kind of team; MIT; the non-goals stated | Passed | README (EN/ZH) and demo checked by `tests/docs.test.mjs`; `LICENSE`; non-goals in README "What each side sees" and CONTRIBUTING. The README makes no claim about how many people used the original tool. |
| Setup once, three roles, invitations, resets, permissions, sessions | Passed | `tests/auth.test.mjs` (setup once, even with two at the same time; sessions; limits; CSRF; owner and admin sessions capped at 12 hours), `tests/members.test.mjs` (roles, links, team members' sign-in links, last owner, deactivation), `tests/permissions.test.mjs`, `tests/api.test.mjs` (every management endpoint refuses members), E2E setup, sign-in link and invitation journeys, with each link also shown as a QR code (`tests/qr.test.mjs`, `tests/home-screen.test.mjs`). Team members sign in with a link instead of a password: a change from the design's §4 decided on 2026-09-29 (see VALIDATION.md) |
| Credit or points, currency, rules locking, exact amounts | Passed | `tests/units.test.mjs` (browser and server parsers agree), `tests/org.test.mjs` (locks), `tests/ledger.test.mjs` (unit changed meanwhile), E2E journeys in both units, E2E settings lock notices |
| One ledger, revoke, refund, retries, two devices at once | Passed | `tests/ledger.test.mjs`, `tests/redemptions.test.mjs`, `tests/concurrency.test.mjs` (worker threads, separate connections), `tests/api.test.mjs` (retries, busy database), `tests/pending.test.mjs` (retry keys across reloads), E2E tests with answers lost, cut short, or lost before a reload |
| Reserve, final states, deactivation cancels, price snapshot | Passed | `tests/redemptions.test.mjs`, `tests/concurrency.test.mjs`, `tests/members.test.mjs` (deactivation cancels pending requests), the price-changed tests (`tests/redemptions.test.mjs`, `tests/api.test.mjs`, and in the browser) |
| Permanent collection, revoke threshold, complete set, theme rules | Passed | `tests/collections.test.mjs` (released keys never removed, fixed order, revoke keeps unlocks, complete collection), `docs/THEMES.md` |
| Member, team and settings views; phone; English and Chinese | Passed (Chromium only) | `tests/e2e/product.spec.mjs`, `tests/e2e/accessibility.spec.mjs` (390 px and 1440 px), `tests/i18n.test.mjs` (same strings and placeholders in both languages) |
| Branding, logo upload, contact link, feedback link, export | Passed | `tests/org.test.mjs` (logo decoding and limits, safe link schemes), `tests/csv.test.mjs`, `tests/api.test.mjs` (export only from Crumb's pages), E2E CSV download |
| Persistence, migrations, container, HTTPS | Partly | Persistence and migrations: `tests/db.test.mjs`, the process drill (restart). Container: built and taken through the whole container drill in CI for 0.1 (`67a174b`) and 0.2.0 (`1fb57ee`, `bbfda7f`), **not verified** for the themes round. HTTPS: only the Compose configuration was validated — **not verified** on a real domain. |
| Consistent backup, restore, upgrade, owner rescue | Partly | `tests/backup.test.mjs`, `tests/ops.test.mjs`, process drill 20/20, and the container drill in CI (backup in the running container, copy off and back in, restore into a new volume, owner recovery, rollback). Upgrading: migration 002 takes a version 1 database to version 2 in unit tests that build a real schema 1 file from `001-initial.sql` and open it with the current code (see "Migration 002" below); upgrading a real deployment of 0.1 with the 0.2 image: **not verified**. Migration 003 takes a schema 2 database to schema 3 in unit tests (see "The collection themes round"); upgrading a real deployment of 0.2 with the 0.3 image: **not verified**. Rolling back is still simulated with a copy of the code that has one more migration. |
| Static demo, real screenshots, README, share card | Passed | `tests/e2e/demo.spec.mjs`, `tests/docs.test.mjs`; screenshots made from the real app by `scripts/screenshots.mjs` and reviewed by eye. Links that point at `main` only work after merging: **not verified**. |
| Three feedback paths; no telemetry; no sensitive data sent out | Passed | Issue templates checked by `tests/docs.test.mjs`; the app's Content Security Policy only lets pages load from and talk to Crumb's own address, and the browser tests fail on any violation (`tests/e2e/accessibility.spec.mjs`); the process drill checks that server output holds no passwords or setup code. |

## Acceptance criteria (design section 11)

| Criterion | Status | Evidence |
| --- | --- | --- |
| A clean deploy following the guide; setup only once; records survive a restart | Partly | With Node from a fresh clone: the process drill. With Docker in CI: the container drill ran the guide's steps (setup code, Compose build and start, setup once, restart keeps data and sessions) under its own project name and image tag. HTTPS on a domain: **not verified**. |
| Two devices read the same server state; members cannot read or change others' data | Passed | E2E with separate browser contexts for owner and member; `tests/api.test.mjs` ("a grant … shows up for that member and no one else", "another member's request looks like it does not exist", forged identity fields) |
| After a reward the member sees it and the thanks; precision and input limits in both units | Passed | E2E journeys in points and in credit; `tests/units.test.mjs`; "amounts the unit cannot hold are refused before anything is sent" |
| Two requests at once never overspend; repeated grants or confirmations are not recorded twice; cancelling releases the reservation | Passed | `tests/concurrency.test.mjs`; retry tests in `tests/ledger.test.mjs`, `tests/redemptions.test.mjs`, `tests/api.test.mjs`; E2E lost-answer tests |
| Revoking a reward, refunding a request and deactivating a member keep an auditable history and the right balance | Passed | `tests/ledger.test.mjs`, `tests/redemptions.test.mjs` ("every transition is audited with who did it"), `tests/members.test.mjs`, E2E revoke and refund journeys |
| Normal redemptions never cost collectibles; a restart or a new sign-in does not change them | Passed | `tests/collections.test.mjs` ("spending never takes anything off the shelf"), `tests/db.test.mjs`, process drill (restart), E2E "the same journey in credit mode keeps cents exact and the collection after spending" |
| Password reset, invitation expiry, deactivation, session revocation and CSRF have automated tests | Passed | `tests/members.test.mjs`, `tests/auth.test.mjs`; the same for team members' sign-in links (one use, 7 days, a new link or a role change ending sessions) |
| HTML-looking input shows as text; logo uploads limited in type, size and path, nothing executable | Passed | E2E "names and messages that look like HTML are shown as text and never run"; `tests/org.test.mjs` logo tests; `tests/auth.test.mjs` "only the product files are served" |
| A real backup restored into a new instance, compared on members, ledger, requests and collections | Partly | The process drill and the container drill in CI restore into a new folder or volume and check sign-in, balance and collection; `tests/backup.test.mjs` compares every business table, including requests. Requests are not compared in the drills. |
| Browser checks of the full admin and member journeys, phone layout, keyboard use, reduced motion | Partly | Passed in Chromium (`tests/e2e/`). Other browsers and a real screen reader: **not verified**. |
| The README's deployment commands actually run; links reachable; screenshots match | Partly | Screenshots from the real app, reviewed. The Docker commands: run in CI by the container drill in equivalent form (own project name and image tag); the HTTPS commands: **not verified**. Links: local links checked by `tests/docs.test.mjs`; of the external ones, only the public demo and the issue chooser were checked (read-only, before the review); links to `main` work only after merging. |

## The one-page round

Checked on a fresh clone of the development branch on 2026-10-01, which includes the review
fixes, the tests they added, the four decisions taken after the review and the sign-out fix,
on one Windows computer, in Chromium only (`npm test` 227 passed and 2 skipped of 229,
collectible manifest current, process drill 20 of 20, browser tests 81 of 81). After that run
only this checklist and VALIDATION.md changed before 0.2.0 was released, so its code is the
code of 0.2.0.
The commit cloned was `2ddc69b` ("fix: sign-out counts only once the server confirms it"),
the sign-out fix on top of the squashed release commit `1421aa2` ("Crumb 0.2.0").

The previous record, kept in VALIDATION.md, is a fresh clone of `1421aa2` made earlier on
2026-10-01, which covered the release before the sign-out fix (`npm test` 227 passed and 2
skipped of 229, collectible manifest current, process drill 20 of 20, browser tests 75 of 75);
a fresh clone of the development branch made earlier the same day, before the squash and on
the same code, gave the same counts.

During development, before the branch history was squashed into the 0.2.0 commit: before the
decisions, a fresh clone with the review fixes, on 2026-09-30, gave `npm test` 219 passed and
2 skipped of 221, browser tests 70 of 70 and process drill 20 of 20. Each decision was first
checked in the development folder: removing request keys at sign-out (`npm test` 223 passed
and 2 skipped of 225, browser tests 71 of 71), and with the browser tests added after its
review (`npm test` 223 passed and 2 skipped of 225, browser tests 73 of 73); the activity log
on the Team page for admins (`npm test` 224 passed and 2 skipped of 226, browser tests 74 of
74); the release as 0.2.0, with everything before it, including "Almost there" only when the
member is close (`npm test` 227 passed and 2 skipped of 229, browser tests 75 of 75). Their
dates are in VALIDATION.md, under "Earlier runs during development". CI ran on this round's
pull request (`1fb57ee`) and on `main` after merging (`bbfda7f`), both jobs green (see
VALIDATION.md, "Results in CI").

| Requirement | Status | Evidence |
| --- | --- | --- |
| One member page in both spending modes | Passed (Chromium only) | `tests/e2e/one-page.spec.mjs` (an entry in self-recorded mode; benefits and requests on one page in confirmed mode; one level-1 heading in both modes; the log's five recent rows, everything by month and folding back), `tests/e2e/product.spec.mjs` (confirmed-mode journeys), `tests/e2e/accessibility.spec.mjs` (both modes and the keypad at 390 px and 1440 px: no sideways scrolling, every control labelled, no CSP violations). On a real phone: **not verified**. |
| Self-recorded entries and corrections | Passed (Chromium only) | `tests/spending.test.mjs` (amount, balance, unit, whole points, confirmed mode and inactive accounts refused; a retry recorded once; the shelf unchanged; one correction each, with a reason), `tests/api.test.mjs` (an entry and its correction over HTTP; a fraction refused in points), `tests/csv.test.mjs` (both kinds exported), `tests/concurrency.test.mjs` (since the review fixes: two devices' entries against one balance, an entry racing a confirmation, two corrections of one entry); E2E: an entry changes the big number and the log, more than the balance cannot be confirmed, the owner corrects an entry from the Team log and the member sees it put right. |
| Batch treats | Passed (Chromium only) | `tests/batch.test.mjs` (one row, one unlock and one audit row with the batch id per person; all or nothing; the unit, the amount and the largest balance checked; single treats unchanged), `tests/api.test.mjs` (over HTTP; every Team log row carries its batch's size; `?batchId=` lists one batch); E2E: three people from the dialog fold into one log line, and a batch of 25 whose rows run past the first page of the Team log stays one line that opens to all 25, each with their own "Take back"; taking one back opens the batch again with the keyboard on it. |
| Switching the spending mode | Passed (Chromium only) | `tests/org.test.mjs` (defaults to self-recorded; chosen at setup; owners only, at any time), `tests/redemptions.test.mjs` (requests only in confirmed mode; waiting requests resolvable after a switch); E2E: the owner switches in Settings and both pages change; a request left waiting by a switch to self-recorded still shows and is confirmed. |
| Request keys cleared at sign-out and when the signed-in person changes | Passed (Chromium only) | `tests/pending.test.mjs` (a person's keys forgotten at sign-out, everyone else's when someone signs in, all of them when no one is, also with storage full or blocked); E2E in `tests/e2e/one-page.spec.mjs`: none of the member's keys left after they sign out, also when no answer comes to who is signed in next, and none after the server ends their session once the page reloads. Checked in the development folder when the removal was added and again with a browser test for each place keys are removed, and in the fresh clone of `2ddc69b`. On a real phone: **not verified**. |
| Sign-out counts only once the server confirms it | Passed (Chromium only) | Six browser tests in `tests/e2e/one-page.spec.mjs`: a sign-out that never reaches Crumb, and one Crumb answers with a server error, leave the person signed in and told so, and the next try signs out; a confirmed sign-out shows the sign-in page even when no answer comes to who is signed in now; a sign-out from a tab whose session the same member replaced in another tab still ends the browser's session, and one whose session someone else replaced leaves that person signed in; a sign-out Crumb never answers is let go within ten seconds, runs one at a time, and its late answer ends no one's session. Checked in the development folder before `2ddc69b` was committed and in the fresh clone of `2ddc69b`. On a real phone: **not verified**. |
| Who did what for admins | Passed (Chromium only) | `tests/api.test.mjs` (an admin reads the activity log, a team member is refused), checked in the development folder when it was added and in the fresh clone of `2ddc69b`. E2E: an admin's Team page ends with "Who did what", holding the owner's treat and nothing to press, and an admin's old `#/team/activity` address lands there; the owner's Team page neither shows nor fetches it, and their Settings still shows it. On a real phone: **not verified**. |
| Migration 002 on a version 1 database | Partly | `tests/db.test.mjs` builds a real schema 1 database file from `001-initial.sql` and opens it with the current code: rows, sums and rowids kept, every index and trigger there, the new kinds and sign rules hold, confirmed mode when benefits exist, an update that would leave a dangling reference refused with nothing changed. A real deployment of 0.1 upgraded by the 0.2 image, with or without Docker: **not verified**. |
| The header menu on a phone | Passed (Chromium only) | E2E at 390 px: a one-line header with no navigation showing; the name menu holds Mine, Team, Settings, Language and Sign out for an owner; at 1200 px the pills show; a team member has no navigation. `tests/e2e/accessibility.spec.mjs`: the menu fits at 390 px for a member and an owner, and tabbing out of it closes it. On a real phone: **not verified**. |
| The intro with and without reduced motion | Passed (Chromium only) | E2E: the intro shows and a tap skips it (the page's clock held still); with reduced motion no intro and no pastry drops, and without it both pastries drop. `tests/e2e/accessibility.spec.mjs`: with reduced motion nothing keeps moving. How it looks on a real phone: **not verified**. |
| Browser storage | Passed (Chromium only) | `crumb.seen.<user id>` holds three numbers (balance, pastry count, total received) for the person signed in on that browser only. E2E: it is there after the member's page loads, gone after they sign out, and gone after the server ends their session (a new sign-in link) once the page reloads. The request keys (`crumb.pending`) are kept for the person signed in there only too, checked in the development folder when the removal was added: `tests/pending.test.mjs` (a person's keys forgotten at sign-out, everyone else's when someone signs in, all of them when no one is, also with storage full or blocked); E2E: a member's entry whose answer never arrives leaves a key there, and none of the member's keys is left after they sign out; with the browser tests added after its review also none when the page then gets no answer to who is signed in now, and none after the server ends their session (a new sign-in link) once the page reloads. The other storage (language, home-screen tip, request keys across a reload) is covered as listed above. |
| Benefit icons from the theme | Passed (Chromium only) | `tests/redemptions.test.mjs`, `tests/api.test.mjs` (a theme key or none; an edit without it keeps it; the icon is part of the request a key stands for; managers get the theme's names), `tests/db.test.mjs` (2 to 32 characters or none). E2E, added with the review fixes and run in the development folder and in the fresh clone that followed them: a pastry picked in "Add a benefit", named in the interface's language, is drawn on the Team page and on the member's list. |
| "Almost there" only within half the price | Passed (Chromium only) | `tests/units.test.mjs` (`isAlmostThere`: not when the member has enough or is short by more than half, yes when short by at most half, in credit and in points, with an odd price not rounded), E2E in `tests/e2e/one-page.spec.mjs` (at $0.00, $1.00 and $3.00 the line shows under the $4.50 benefit only at $3.00, never under the $1.00 or $12.50 ones, and prices and buttons stay the same). Checked in the development folder with version 0.2.0 and in the fresh clone of `2ddc69b`. On a real phone: **not verified**. |
| Version 0.2.0 | Passed | `tests/docs.test.mjs` (both root fields of `package-lock.json`, and both READMEs' contents heading and status line, follow `package.json`), `tests/auth.test.mjs` (the session reports `package.json`'s version), checked in the development folder with version 0.2.0 and in the fresh clone of `2ddc69b`. The footer reading "Crumb 0.2.0 is open-source software (MIT)." in the member and keypad screenshots retaken by `scripts/screenshots.mjs` (once the version was 0.2.0, and again before the fresh clones of `1421aa2` and `2ddc69b`): seen by eye. |
| Documents and screenshots | Partly | Automated: `tests/docs.test.mjs` (local links resolve, every README image exists and has an alt text of 12 characters or more) and `tests/source.test.mjs` (no invisible characters). Reviewed by eye only: what README (EN/ZH) with "Make it yours" and "What is in version 0.2", OPERATIONS.md (switching, corrections, batches, upgrading from 0.1 to 0.2), DEPLOYMENT.md and THEMES.md say, and the screenshots retaken from the real app by `scripts/screenshots.mjs`. |
| CI and the container drill for this round | Passed | Both jobs passed on the pull request's last commit `1fb57ee` and on the merge commit `bbfda7f` on `main`: the tests on Linux with none skipped, and the container drill (VALIDATION.md, "Results in CI"). |

## The collection themes round

Checked on a fresh clone of the development branch `feature/themes` on 2026-10-05, on one
Windows computer, in Chromium only (`npm test` 283 passed and 2 skipped of 285, theme lists
current, process drill 20 of 20, browser tests 105 of 105). The commit cloned was `9849c31`
("docs: the themes spec says it is implemented on feature/themes"); since that run only this
checklist and VALIDATION.md have changed, so its code is the code of this release. CI has
not run on this round (the branch has not been pushed), so nothing here ran on Linux or in
the container.

| Requirement | Status | Evidence |
| --- | --- | --- |
| Two themes, one per team: Pastry shop (`default`, 39) and Bakery (`bakery`, 24) | Passed | `tests/themes.test.mjs`, `tests/collections.test.mjs` (each list file equals a fresh build from `assets/sprites.js` and what the server loads; released keys per theme, the 12 shared keys under both; three names for every key; card texts with `{count}` and no digits), and `node scripts/theme-manifest.mjs --check` in the run above |
| Pastry shop as in 0.2.0 | Passed (Chromium only) | `tests/collections.test.mjs` (`forSlot` with no theme or `default` gives 0.2.0's pick; a Pastry shop team unlocks as before), `tests/i18n.test.mjs` (the base sentences are Pastry shop's), E2E in `tests/e2e/demo.spec.mjs` (the demo's shelf and legend, 33 and 6, as in 0.2.0) |
| Chosen at setup, Pastry shop when none is chosen | Passed (Chromium only) | `tests/org.test.mjs` (no theme, `bakery`, an unknown theme refused; the `org.setup` activity row records it), `tests/auth.test.mjs` (the signed-out view carries the theme); E2E in `tests/e2e/themes.spec.mjs` (a Bakery team set up in the browser) |
| Changeable until the first treat, then fixed with the unlock step | Passed (Chromium only) | `tests/org.test.mjs` (an owner changes it before the first treat, an admin cannot, `RULES_LOCKED` after; `locks.theme`); E2E: a change in Settings before the first treat; with priced benefits and no treat the revised notice shows and the cards stay selectable; greyed-out cards after the first treat |
| A change removes the benefit icons the new theme lacks | Passed (Chromium only) | `tests/org.test.mjs` (shared icons kept, `iconsRemoved`, the `org.update` activity row; a change without a theme gives 0 and only `changed`), `tests/api.test.mjs` (a benefit added with a request key before a change: its icon cleared, a resend gets the stored answer, still one benefit; a new icon only the old theme has refused with nothing stored); E2E: "Theme changed…" with the number removed, "Settings saved." when none was |
| The server works with the team's theme | Passed | `tests/collections.test.mjs` (a Bakery team unlocks from its 24 keys, capped at 24, in hash order), `tests/api.test.mjs` (`/api/me` and `/api/admin/rewards` carry the team's theme; a benefit icon must be one of its keys), `tests/org.test.mjs` (the session, signed in and out, carries it) |
| The mascot follows the theme | Passed (Chromium only) | `tests/pixels.test.mjs` (each theme's own mascot; a missing or unknown theme id gets Pastry shop's wife cake, and nothing throws); E2E in `tests/e2e/themes.spec.mjs` (a Bakery team's member page, header, intro and sign-in page; the sign-in page after a sign-out whose follow-up question gets no answer; a theme id the page does not know, or none, draws the wife cake with no error). On a real phone: **not verified** |
| Tab and home-screen icons per theme | Partly | `tests/icons.test.mjs` (four files for every theme other than Pastry shop, PNGs with the mascot's pixels; the four addresses answered per team theme, Pastry shop's before setup), `tests/pixels.test.mjs` (the icon links the page sets for each theme, Pastry shop's for a missing or unknown one); E2E: the tab-icon link points at the Bakery icon on a Bakery team's pages, and the tab and home-screen icon links follow a theme change in Settings without a reload. An icon on a real phone's home screen: **not verified** |
| Bakery's own sentences | Passed | `tests/i18n.test.mjs` (both languages; every `<key>.bakery` with its base key and the same placeholders; every one used; no "recognition" or 认可); seen in place in the pictures checked during the run (VALIDATION.md, "Pictures from the fresh clone") |
| Migration 003 on a version 2 database | Partly | `tests/db.test.mjs` (a 0.2.0 database opens on `default`, its data unchanged). A real deployment of 0.2 upgraded by the 0.3 image, with or without Docker: **not verified** |
| A theme this version does not include is refused | Passed | `tests/db.test.mjs` (`THEME_UNKNOWN` when the database is opened; a database with no team opens), `tests/ops.test.mjs` (`recover-owner` refuses it too), `tests/backup.test.mjs` (a schema 3 backup with such a team refused before anything is written; schema 1 and 2 backups and backups taken before setup restore) |
| The public demo's switch | Passed (Chromium only) | E2E in `tests/e2e/demo.spec.mjs` (shelf, mascot and its accessible name, cabinet and numbers change; all three cards have pictures; no console errors; kept across a reload and "Reset the demo"; the tour starts again). On GitHub Pages: **not verified** until merged |
| The shutter animation | Passed (Chromium only) | E2E: the eight shutter tests in `tests/e2e/demo.spec.mjs` (the full sequence: down in eight steps, the sign squashed to a line and given the new name as the shop changes behind it, the wobble, up in eight steps, then the shelf restocked 8 ms apart with a 160 ms pop; a switch takes the old shop's toast with it, and a grant pressed behind the shutter bursts nothing over it; one switch at a time, before and after the sign flips; no shutter for the shop already on show; with reduced motion no shutter and an instant switch; the choice stored at the press, and a page opened with it remembered drawn with no shutter; a switch while the tour plays runs one shutter and restarts the tour from Sam with no oven intro — that the restart comes while the shutter is down is **not verified**). Its look and length: a strip of frames captured from the fresh clone of `9849c31`, shown to the maintainer and approved as it is on 2026-10-06, with the restock's 160 ms pop, 8 ms apart, kept. Finishing in a background tab: checked once on the fresh clone in a Chromium tab hidden while the shutter was down, where the switch still finished, on Bakery with no shutter left. On a real phone: **not verified** |
| The theme choice at both widths | Passed (Chromium only) | `tests/e2e/accessibility.spec.mjs` (setup and Settings at 390 px and 1440 px: no sideways scrolling, every control labelled, no CSP violations) |
| `npm run demo -- --theme bakery` | Passed | `tests/demo.test.mjs` (the sample team on Bakery; an unknown theme refused before anything is made) |
| The 12 new drawings | Reviewed by eye | Each at intro and header size, in two batches, before it was final (§12 of the themes design, acceptance 1): the first seven, Bitten Toast among them, and the other five, both batches approved on 2026-10-05. The drawings in the commit cloned are exactly the approved ones, compared during the run with the approval record kept outside the repository |
| Bakery pages and the demo after switching | Reviewed by eye | Six pictures taken from the fresh clone of `9849c31`, shown to the maintainer and approved as they are on 2026-10-06: the Bakery member page, Settings with the two theme cards before the first treat, Settings after switching to Bakery with one benefit icon removed, the demo after switching to Bakery at 1280 px, the shutter's frame strip, and the Bakery sign-in page at phone width; the public demo at `9849c31` was also opened for the maintainer in a browser. The other pictures were checked against the design during the run (VALIDATION.md, "Pictures from the fresh clone"). None is kept in the repository, where the README stays on Pastry shop |
| Version 0.3.0 | Passed | `tests/docs.test.mjs` (the lock file and both READMEs follow `package.json`), `tests/auth.test.mjs` (the session reports it), in the run above. The footer in the README screenshots retaken by `scripts/screenshots.mjs` reads "Crumb 0.3.0 is open-source software (MIT).", checked in those screenshots during the run |
| Documents | Partly | Automated: `tests/docs.test.mjs` (local links resolve, every README image exists and has an alt text) and `tests/source.test.mjs` (no invisible characters). Not automated: what README (EN/ZH), THEMES.md, OPERATIONS.md, DEPLOYMENT.md and CONTRIBUTING.md say; their new sentences were shown to the maintainer and approved before they were committed |
| CI and the container drill for this round | Not verified | The branch has not been pushed; Docker is not installed on the computer that ran the fresh clone. |

## Before calling this version ready for real benefits

- [x] Open a pull request and get both CI jobs green — the tests on Linux (including the two
      file-permission tests that are skipped on Windows) and the container drill. Done for
      `67a174b`; later commits must stay green on the pull request.
- [x] Record that run in [VALIDATION.md](VALIDATION.md).
- [ ] A human code review of the change.
- [x] The one-page round: push the branch, open a pull request, get both CI jobs green (the
      tests on Linux and the container drill), and record that run in VALIDATION.md (green on
      `1fb57ee` and on `bbfda7f`, recorded with the themes round).
- [ ] The themes round: push the branch, open a pull request, get both CI jobs green (the
      tests on Linux and the container drill), and record that run in VALIDATION.md.
- [ ] The one-page round on a real phone: the member page in both spending modes, the keypad,
      the name menu, and the intro with and without reduced motion.
- [ ] Upgrade a copy of a real instance of 0.1 (invented data) with the 0.2
      image, as OPERATIONS.md describes, and check balances, requests, collections and the
      spending mode it chose.
- [x] Agree to keeping request keys in the browser, and remove the README's unconfirmed
      statements about the original tool (done on 2026-09-28).
- [x] Decide how team members sign in: with a personal link, no password (decided on
      2026-09-29), shown as a QR code too, and kept for a fixed 180 days.
- [x] On a real iPhone: scan a code, sign in, add Crumb to the home screen and open it from the
      icon still signed in; in WeChat, scan a code, follow the note to open it in the browser,
      and sign in there (passed on 2026-09-29).
- [ ] The same on an Android phone, and opening a sent picture with a long press.
- [ ] Decide the open items listed under "Known limits" in VALIDATION.md.
- [ ] Try the HTTPS setup on a real domain once, including a backup and a restore.
- [ ] After merging, check that the demo with its switch between Pastry shop and Bakery, the
      README links and the GitHub Pages site work. The app folder that GitHub Pages also
      publishes says it needs its own server (tested with a local server laid out like GitHub
      Pages).
- [ ] The themes round on a real phone: a Bakery team's member page, header and intro, its
      icon added to the home screen, and the demo's switch and shutter.
- [ ] Upgrade a copy of a real instance of 0.2 (invented data) with the 0.3 image, as
      OPERATIONS.md describes, and check that it comes up on Pastry shop with its balances,
      collections, benefit icons and settings unchanged.
