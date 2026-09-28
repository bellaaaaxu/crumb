# Contributing to Crumb

Crumb has two parts in one repository:

- **The self-hosted app** — `server/` (Node.js, Express, SQLite) and `app/` (plain HTML, CSS
  and ES modules) — with a full test suite.
- **The public demo** — `index.html` and `assets/` — a single static page with no build step
  and no dependencies, published on GitHub Pages.

Start with the [README](README.md). Deployment and operations are in [docs/](docs/DEPLOYMENT.md).

## Useful contributions

- Reproducible bug reports and **usage stories** — the issue templates ask only what helps.
- Accessibility: keyboard, screen reader and reduced-motion improvements.
- Translations. The app ships English and Simplified Chinese; `app/locales/*.js` must keep
  exactly the same keys (a test checks).
- Documentation that made you stop and wonder.
- Pixel art, following [docs/THEMES.md](docs/THEMES.md).

For larger changes, open an issue first describing the problem and your approach. Some
things are out of scope on purpose: payroll or cash, buying rewards, performance reviews,
leaderboards or comparisons between members, automatic rewards, analytics or any data leaving
the instance, and hosting many organizations in one instance.

**Never use real people's data** — not in issues, tests, fixtures or screenshots.

## Working on the app

You need Node.js 24.14 or newer (24.x).

```bash
npm ci
npm test                                   # unit, API, concurrency and operator-command tests
npx playwright install chromium
npm run test:e2e -- --project=chromium     # browser tests, each on its own throwaway server
node scripts/ci/process-drill.mjs          # start, restart, back up, restore, recover, roll back
node scripts/theme-manifest.mjs --check    # the collectible manifest matches assets/sprites.js
```

With Docker available, `bash scripts/ci/container-drill.sh` runs the same drill against the
real image and Compose files, on throwaway volumes. CI runs all of the above on every pull
request.

To use the app locally:

```bash
node scripts/init-secrets.mjs                 # one-time setup code and a local .env
node --env-file=.env server/main.mjs          # then open http://localhost:3000
```

`node scripts/screenshots.mjs` regenerates the README screenshots from a throwaway instance
filled with an invented team.

### Ground rules in the code

- **The server decides.** Every permission and every amount is checked on the server; hiding
  a button is never the control. Identity comes from the session, never a request body.
- **Money is integers.** Amounts are integer units (cents or points) from the moment they
  are parsed; nothing adds up fractional numbers.
- **The ledger is append-only.** Corrections are new, linked entries with a reason.
- **One transaction per change**, with its idempotency key, so a retry is never recorded twice.
- **Text from people goes in through `textContent`.** The app never uses `innerHTML`.
- **Every visible string is in both locale files.**
- Follow the style of the file you are in. Comments explain *why*.

## Working on the demo

There is no build step. Open `index.html` directly in a browser, or serve the folder
(`python3 -m http.server 4173`, or `py -m http.server 4173` on Windows).

The demo keeps its invented state in `localStorage`; **Reset the demo** puts it back. Check the
tour, taking control, giving recognition, spending (the collection must not shrink),
switching people and resetting, on narrow and wide screens, from the keyboard and with reduced
motion. `npx playwright test tests/e2e/demo.spec.mjs` covers the main path.

If you change the preview artwork, run `node scripts/make-og.mjs` and look at
`assets/og.png` before committing.

## Pull requests

1. Fork the repository and create a branch for one focused change.
2. Make the change, with tests for anything the server does.
3. Run the checks above that apply, and say in the pull request what you ran and what
   happened — including anything you could not run.
4. For visible changes, include before-and-after screenshots with invented data.

Keep discussion constructive and explain trade-offs. Small, focused changes are easier to
review.
