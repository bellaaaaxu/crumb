# Crumb

<img align="right" width="300" src="assets/screenshots/member.png" alt="A team member’s page on a phone: 106.50 of Café credit in big pixel digits, five pixel pastries on her shelf with the next one in the oven, an “I grabbed something” button, her latest log entries and the team’s welcome line">

## Make appreciation something to keep.

Open-source recognition and rewards for teams. Self-hosted, with data under your control.

[Try the demo](https://bellaaaaxu.github.io/crumb/) · [Deploy Crumb](docs/DEPLOYMENT.md) · [Share feedback](https://github.com/bellaaaaxu/crumb/issues/new/choose)

Most thank-yous are gone the moment they are said. Crumb gives them somewhere to land.

A team lead sends a **treat**: an amount, with a few words about what someone did if they
like. It goes toward **real things** your team has to offer — a coffee, a lunch, a voucher.
And each time someone's treats add up past a step you set, a new **pixel pastry** joins
their shelf. Spending never takes one away: the shelf counts thanks received, not money
held.

Crumb runs on your own server, for one organization, with its data in one file you back up
and control. No analytics, no email service, and the app itself sends nothing anywhere.

<br clear="right">

## A short story

*The team and people here are invented.*

**Thursday, 4:40 p.m.** The espresso machine floods an hour before close. Mina stays late,
mops up and gets the bar ready for the morning.

**Friday.** Olive, who runs the team, opens Crumb, taps *Treat someone*, ticks Mina, types
$30 and writes: *Stayed late to close when the espresso machine flooded. The morning crew
walked into a spotless bar.* Mina's balance rolls up by $30, a new pastry drops onto her
shelf, and Olive's words wait in her log.

**The next week.** Mina takes lunch from the kitchen, taps *I grabbed something* and keys in
$14. It comes off her balance there and then.

**Months later.** Her balance has gone up and down. Her shelf has only grown, and the
thank-you from that Thursday is still in her log.

## What each side sees

**Team members** have one page (above): what they can spend, in big pixel digits; their shelf
of pastries and which one is in the oven; the way their team spends; and a log of what came
in and what went out — the latest five entries, or everything by month. Each person sees only
their own account — there are no leaderboards and no comparisons.

A team chooses how people spend. When people jot it down themselves, spending is one button,
*I grabbed something*, and a keypad; the amount comes off at once:

<img src="assets/screenshots/spend.png" width="300" alt="The keypad on a phone, rising over the page: “How much did you grab?”, $106.50 to spend, 12.50 keyed in, and the Cancel and “Jot it down” buttons">

When an admin confirms, the page lists the benefits people can ask for and their requests
instead. A request sets the amount aside, and it comes off once an admin confirms the benefit
was handed over; declining or cancelling simply releases it.

**Team leads** — owners and admins — give treats from the *Team* page, to one person or to
several at once:

<img src="assets/screenshots/admin.png" width="100%" alt="The “Treat someone” dialog on the Team page: Dana Reyes, Leo Martins and Sam Okafor ticked, 20.00 each, a short Mid-Autumn thank-you, and the button “Treat 3 people · $60.00 all in”">

The same page lists the people: each row opens to that person's actions — a one-time
invitation or sign-in link (a new sign-in link when someone changes phones), a role change,
deactivation. Below it is the team's log, where a treat can be taken back, a jotted-down entry
fixed, and a confirmed benefit refunded. Each correction needs a reason, and both entries stay
in the log, the original marked. A treat to several people is one line in the log that opens
to each person. When the team confirms what people spend, the page also has the requests
waiting and the benefit list, where each benefit can have a pastry as its icon.

Owners also have *Settings*: the name, logo, welcome line, language, reward rules, how people
spend, contact and feedback links, and the activity log, *Who did what*. Admins have no
Settings; they read the same activity log, read-only, at the bottom of the Team page. The
header stays one line: the name on the right opens a menu with the language and signing out,
and on a phone the pages too.

## Where it fits

Any team that wants thanks to add up to something — for example:

- **A café or bakery:** thank the person who closed alone on a snowy night; the treat
  becomes coffee or lunch on the house.
- **A shop:** thank everyone who worked the busiest Saturday of the season, in one go; the
  treat becomes a store voucher.
- **An office team:** thank whoever unblocked a release; the treat becomes a book, a team
  lunch or event tickets.

These are examples of how it can be used, not a list of teams that use it.

## Make it yours

Crumb is for a small shop that wants to download it, fill in a few settings and get going: a
bakery, a café, a bubble tea place, or any small team. No code needed.

Settings do the rest: your name and logo, the language, what you call the credit ("Café
credit", "stars"), credit or points, the currency, how much earns a pastry, a welcome line,
how people spend (they jot it down themselves, or an admin confirms), a contact link and a
feedback link.

Want different pastries? That's one file: [docs/THEMES.md](docs/THEMES.md).

Why "Crumb"? Eat the bread and the crumbs stay. Spend the credit and the shelf keeps what it
earned.

## What is in version 0.2

New in 0.2:

- **One page for team members**, with nothing to switch between: what they can spend, their
  shelf and the pastry in the oven, how their team spends, and their log. Team leads work
  from one *Team* page with no sub-pages, owners from *Settings* too, and the header stays
  one line.
- **Self-recorded spending**: people key in what they took, and it comes off at once. It sits
  beside the benefit requests of 0.1, now called **confirmed**; each team uses one of the two,
  and an owner can change it at any time. Setup picks self-recorded unless you choose
  otherwise.
- **Treats to several people at once**, with one amount each, all recorded or none; the log
  shows them as one line.
- **Corrections of self-recorded entries**: an admin fixes one, with a reason, and the
  original stays in the log, marked.
- **Benefit icons**: a benefit can take one of the pastries as its icon.
- **The look of the original benefits site**, with five short animations, and no motion when
  people ask for less.
- **New words**: a *treat* is what 0.1 called recognition, throughout the app.

Upgrading from 0.1 updates the database once, on the first start: read
[Upgrading from 0.1 to 0.2](docs/OPERATIONS.md#upgrading-from-01-to-02) and back up first.

Still there from 0.1:

- **Treats** with an amount and an optional message, in **credit** (CAD, USD or CNY, exact
  to the cent) or whole **points** under a name you choose.
- **Benefits** your team defines, when it confirms what people spend: the amount is set
  aside, an admin confirms delivery or declines, members can cancel while it waits, and a
  confirmed request can be refunded once.
- **Corrections that stay on the record**: an admin takes back a treat or refunds a benefit,
  always with a reason; the original stays in the log, marked.
- **A permanent collection** of 39 pixel pastries, unlocked by treats received. Spending
  never removes one, and neither does correcting a mistaken treat.
- **Roles**: owner, admin and member. Team members sign in with a personal link — no
  password to remember — and their phone stays signed in for up to 180 days; a new link
  signs a lost phone out. Owners and admins use a password. Every link is shown to an admin
  with its QR code: the person scans it in person, or it is sent as a picture that a long
  press opens. Sign-in and invitation links last 7 days, password resets 30 minutes — Crumb
  sends no email.
- **Records that stay put**: an append-only ledger and activity log. A treat, an entry, a
  request, a confirmation or a correction that is retried after a dropped connection is still
  recorded once, and two devices cannot spend the same balance.
- **Your brand and language**: organization name, logo and welcome message; English and
  Simplified Chinese, with each person free to choose.
- **Made for phones**, usable from the keyboard alone, with labelled controls and announced
  updates for screen readers, and no motion when people ask for less.
- **Operations**: consistent backups while running, restore into a new volume, owner
  recovery from the server, Docker Compose with automatic HTTPS through Caddy, and a
  spreadsheet-safe CSV export.

Crumb is deliberately **not** payroll or cash: treats cannot be withdrawn or bought, it does
not do performance reviews, leaderboards or automatic rewards, and it is not a hosted service
— you run it.

## Try it

```bash
git clone https://github.com/bellaaaaxu/crumb.git
cd crumb
node scripts/init-secrets.mjs      # no Node? see the Docker-only command in docs/DEPLOYMENT.md
docker compose up -d --build
```

Open <http://localhost:3000>, paste the one-time setup code (`cat .secrets/setup-token`),
choose credit or points and how people spend, and create the owner account.

To look around first, with Node.js 24 and no Docker: `npm ci`, then `npm run demo`. It opens
an invented team, "Corner Café (sample team)", at <http://localhost:3000> and prints the
owner's sign-in and a team member's sign-in link; everything is deleted when you stop it.
The sample team jots down what it spends; to see the other way, sign in as the owner and
choose *Confirmed* under *How people spend* in Settings.

For your team you need a server with Docker and Docker Compose v2, about 1 GB of memory, and
a domain name so Crumb can run on HTTPS. [The deployment guide](docs/DEPLOYMENT.md) walks
through it; [the operations guide](docs/OPERATIONS.md) covers backups, restores, upgrades and
a locked-out owner. Crumb is free; hosting a server usually is not.

## Your data

Everything lives in one SQLite database on your server — people, password hashes, the
ledger, requests, collections, the activity log and your logo. Back it up with one command
while Crumb keeps running, and practise restoring it; the CSV export is for reading, not for
restoring. Crumb collects no analytics and sends nothing to anyone, including this project.
(With the HTTPS setup, the bundled Caddy proxy contacts Let's Encrypt for its certificate.)

Inside Crumb, *Contact your admin* leads to your organization's own page or address;
*Feedback on Crumb* leads here, unless an owner points it at their own form. The two never
stand in for each other.

## Status and limits

Crumb is **early — version 0.2**. The money rules, permissions, concurrency and recovery
are covered by automated tests, and [docs/VALIDATION.md](docs/VALIDATION.md) records exactly
what was tested, where, and what has not been verified yet. It has not had an independent
security audit.

One instance serves one organization. There is no email, no single sign-on, one collection
theme (the pastries), and it runs as a single server. Use it for a team's perks with regular
backups; do not use it for pay or anything tax-related.

## Contributing and feedback

Bug reports, usage stories and ideas are all welcome — [open an issue](https://github.com/bellaaaaxu/crumb/issues/new/choose)
(it needs a GitHub account; please use invented names, never real people's data). To change
code, docs, translations or pixel art, read [CONTRIBUTING.md](CONTRIBUTING.md); new
collectibles follow [docs/THEMES.md](docs/THEMES.md).

## The demo

[The demo](https://bellaaaaxu.github.io/crumb/) is a single static page: no server, no
sign-in, no dependencies, and it keeps its invented data in your browser. It plays a short
tour of the idea by itself; one touch hands you the controls. The self-hosted app in this
repository is the real thing, with accounts, roles, benefits and a shared ledger.

## The art

All 39 pastries live in the source as character grids, 12×12 each, in
[`assets/sprites.js`](assets/sprites.js) — no icon library, no pixel font, no image files.
The demo, the app and the link-preview card all draw from that one table.

```js
laopo: { palette: { X: '#5C3A1D', b: '#E0A73C', a: '#F3D488', s: '#8A5A22' }, rows: [
  '....XXXX....',
  '..XXbbbbXX..',
  ...
```

## How it is put together

Node.js 24 with Express and SQLite (better-sqlite3); sharp re-encodes uploaded logos and
draws the QR codes that uqr works out, on your own server. The
interface is plain HTML, CSS and ES modules — no framework and no build step. Tests use
Node's test runner and Playwright; deployment uses Docker Compose and Caddy.

```
server/     the API, the ledger and the rules, one module each
app/        the self-hosted interface, English and Simplified Chinese
themes/     the collectible set, generated from assets/sprites.js
scripts/    setup code, backup, restore, owner recovery, screenshots
tests/      unit, API, concurrency and browser tests
docs/       deployment, operations, themes and validation
index.html  the public demo (with assets/)
```

## Where it came from

Crumb began as an internal staff-credit tool for a bakery. This repository generalises it for
any team.

For that tool, I wrote the specifications and chose and reviewed what came back — including
the pixel art, which I directed and selected rather than placed cell by cell. I don't write the
code by hand. The judgment on display is in the data model, the permissions and the decisions
about what to show.

## License

Crumb is open source under the [MIT License](LICENSE). You may use, modify and deploy it,
including commercially, provided you keep the copyright and license notice.

Designed & built by **Bella Xu** · [github.com/bellaaaaxu](https://github.com/bellaaaaxu) ·
[中文说明](README.zh-CN.md)
