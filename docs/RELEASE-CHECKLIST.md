# Release checklist — Crumb 0.1

One row for each requirement in the design's coverage table and each acceptance criterion in
its section 11, with the evidence behind it. How and where the checks ran is in
[VALIDATION.md](VALIDATION.md).

**Passed** means an automated check ran and passed on the recorded commit. **Partly** means
some of the requirement was checked and the rest was not. **Not verified** means it has not
been run at all — nothing is marked passed on the strength of reading the code.

## Design coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| For any kind of team; MIT; the non-goals stated | Passed | README (EN/ZH) and demo checked by `tests/docs.test.mjs`; `LICENSE`; non-goals in README "What each side sees" and CONTRIBUTING. The README's "about thirty people" is **not verified** (the maintainer to confirm). |
| Setup once, three roles, invitations, resets, permissions, sessions | Passed | `tests/auth.test.mjs` (setup once, even with two at the same time; sessions; limits; CSRF), `tests/members.test.mjs` (roles, links, last owner, deactivation), `tests/permissions.test.mjs`, `tests/api.test.mjs` (every management endpoint refuses members), E2E setup and invitation journeys |
| Credit or points, currency, rules locking, exact amounts | Passed | `tests/units.test.mjs` (browser and server parsers agree), `tests/org.test.mjs` (locks), `tests/ledger.test.mjs` (unit changed meanwhile), E2E journeys in both units, E2E settings lock notices |
| One ledger, revoke, refund, retries, two devices at once | Passed | `tests/ledger.test.mjs`, `tests/redemptions.test.mjs`, `tests/concurrency.test.mjs` (worker threads, separate connections), `tests/api.test.mjs` (retries, busy database), E2E lost-answer tests |
| Reserve, final states, deactivation cancels, price snapshot | Passed | `tests/redemptions.test.mjs`, `tests/concurrency.test.mjs`, `tests/members.test.mjs` (deactivation cancels pending requests), the price-changed tests (`tests/redemptions.test.mjs`, `tests/api.test.mjs`, and in the browser) |
| Permanent collection, revoke threshold, complete set, theme rules | Passed | `tests/collections.test.mjs` (released keys never removed, fixed order, revoke keeps unlocks, complete collection), `docs/THEMES.md` |
| Member, team and settings views; phone; English and Chinese | Passed (Chromium only) | `tests/e2e/product.spec.mjs`, `tests/e2e/accessibility.spec.mjs` (390 px and 1440 px), `tests/i18n.test.mjs` (same strings and placeholders in both languages) |
| Branding, logo upload, contact link, feedback link, export | Passed | `tests/org.test.mjs` (logo decoding and limits, safe link schemes), `tests/csv.test.mjs`, `tests/api.test.mjs` (export only from Crumb's pages), E2E CSV download |
| Persistence, migrations, container, HTTPS | Partly | Persistence and migrations: `tests/db.test.mjs`, the process drill (restart). Container and HTTPS: **not verified** — the image, Compose files and Caddy have never run. |
| Consistent backup, restore, upgrade, owner rescue | Partly | `tests/backup.test.mjs`, `tests/ops.test.mjs`, process drill 20/20. The Docker version of the drill: **not verified**. Upgrading between two real releases: **not verified** (only one schema version exists; a rollback is simulated with a copy of the code that has one more migration). |
| Static demo, real screenshots, README, share card | Passed | `tests/e2e/demo.spec.mjs`, `tests/docs.test.mjs`; screenshots made from the real app by `scripts/screenshots.mjs` and reviewed by eye. Links that point at `main` only work after merging: **not verified**. |
| Three feedback paths; no telemetry; no sensitive data sent out | Passed | Issue templates checked by `tests/docs.test.mjs`; the app's Content Security Policy only lets pages load from and talk to Crumb's own address, and the browser tests fail on any violation (`tests/e2e/accessibility.spec.mjs`); the process drill checks that server output holds no passwords or setup code. |

## Acceptance criteria (design section 11)

| Criterion | Status | Evidence |
| --- | --- | --- |
| A clean deploy following the guide; setup only once; records survive a restart | Partly | From a fresh clone with Node: process drill (setup once, restart keeps data and sessions). The guide's Docker commands: **not verified**. |
| Two devices read the same server state; members cannot read or change others' data | Passed | E2E with separate browser contexts for owner and member; `tests/api.test.mjs` ("a grant … shows up for that member and no one else", "another member's request looks like it does not exist", forged identity fields) |
| After a reward the member sees it and the thanks; precision and input limits in both units | Passed | E2E journeys in points and in credit; `tests/units.test.mjs`; "amounts the unit cannot hold are refused before anything is sent" |
| Two requests at once never overspend; repeated grants or confirmations are not recorded twice; cancelling releases the reservation | Passed | `tests/concurrency.test.mjs`; retry tests in `tests/ledger.test.mjs`, `tests/redemptions.test.mjs`, `tests/api.test.mjs`; E2E lost-answer tests |
| Revoking a reward, refunding a request and deactivating a member keep an auditable history and the right balance | Passed | `tests/ledger.test.mjs`, `tests/redemptions.test.mjs` ("every transition is audited with who did it"), `tests/members.test.mjs`, E2E revoke and refund journeys |
| Normal redemptions never cost collectibles; a restart or a new sign-in does not change them | Passed | `tests/collections.test.mjs` ("spending never takes anything off the shelf"), `tests/db.test.mjs`, process drill (restart), E2E "the same journey in credit mode keeps cents exact and the collection after spending" |
| Password reset, invitation expiry, deactivation, session revocation and CSRF have automated tests | Passed | `tests/members.test.mjs`, `tests/auth.test.mjs` |
| HTML-looking input shows as text; logo uploads limited in type, size and path, nothing executable | Passed | E2E "names and messages that look like HTML are shown as text and never run"; `tests/org.test.mjs` logo tests; `tests/auth.test.mjs` "only the product files are served" |
| A real backup restored into a new instance, compared on members, ledger, requests and collections | Partly | Process drill (real processes, new folder) and `tests/backup.test.mjs` (every business table compared). With Docker volumes: **not verified**. |
| Browser checks of the full admin and member journeys, phone layout, keyboard use, reduced motion | Partly | Passed in Chromium (`tests/e2e/`). Other browsers and a real screen reader: **not verified**. |
| The README's deployment commands actually run; links reachable; screenshots match | Partly | Screenshots from the real app, reviewed. The Docker commands: **not verified**. Links: local links checked by `tests/docs.test.mjs`; of the external ones, only the public demo and the issue chooser were checked (read-only, before the review); links to `main` work only after merging. |

## Before calling 0.1 ready for real benefits

- [ ] Open a pull request and get both CI jobs green — the tests on Linux (including the two
      file-permission tests that are skipped on Windows) and the container drill.
- [ ] Record that run in [VALIDATION.md](VALIDATION.md).
- [ ] A human review of the change.
- [ ] Decide the open items listed under "Known limits" in VALIDATION.md, and confirm or
      reword the README's "about thirty people".
- [ ] Try the HTTPS setup on a real domain once, including a backup and a restore.
- [ ] After merging, check that the demo, the README links and the GitHub Pages site work,
      and that GitHub Pages does not publish the app folder as a page that cannot work.
