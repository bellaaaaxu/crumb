# Validation report

What has been checked for Crumb 0.1, how, where, and what has **not** been checked yet.
Nothing is marked as passing unless it was actually run.

> Work in progress: this report is completed in the release-validation step, after a run
> from a clean checkout and an independent review. Until then it records the checks run
> during development.

## Environment used so far

- Windows 11 Pro (10.0.26200), Node.js 24.14.0, npm 11.9.0, SQLite 3.53.4 (bundled with
  better-sqlite3 13.0.3), sharp 0.35.5 with libvips 8.18.7.
- Chromium 1243 via Playwright 1.63.0.
- **Docker is not installed on this machine.** Nothing involving the image or Compose has
  been run here.

## Checks run during development

| Area | How | Result |
| --- | --- | --- |
| Units, schema, auth, members, ledger, collections, redemptions, API, organization, CSV, backup/restore, operator commands, i18n, docs | `npm test` (node:test) | passing at each task commit |
| Two devices spending one balance; the same request sent twice at once; deactivation racing a request | worker threads with separate database connections | passing; a mutation that removed the transaction made the overdraft test fail 3/3 |
| Member and admin journeys in credit and points, cancel/decline/refund, revoke, setup, invitations, deactivation, language | Playwright, a real server per test | passing |
| Phone (390×844) and desktop (1440×900) widths, CSP violations, labelled controls, keyboard-only sign-in and redemption, reduced motion, HTML-looking input | Playwright | passing (found and fixed two real layout bugs) |
| Start, setup, restart, backup while running, restore to a new folder, switch, owner recovery, rollback | `node scripts/ci/process-drill.mjs` (real server processes) | 20/20 checks passing |

## Not verified yet

- Docker image build, `docker compose config`/`up`, the container health check and the
  container drill (`scripts/ci/container-drill.sh`). CI runs these once the branch is pushed.
- HTTPS through Caddy on a real domain.
- Graceful shutdown on SIGTERM (Windows cannot send it the same way).
- A real screen reader, and browsers other than Chromium.
- An independent security audit.
