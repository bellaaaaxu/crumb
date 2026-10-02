# Crumb: One-Page Member View, Self-Recorded Spending and Batch Treats

*Translated from the Chinese original, [2026-09-29-crumb-one-page-design.zh-CN.md](2026-09-29-crumb-one-page-design.zh-CN.md).*

Status: implemented (2026-09-30, branch `feature/one-page`); design approved 2026-09-29. This document describes what was built; where the build settled something differently from the approved design, §16 lists it.
Baseline: 0.1 (the self-hosted release on `main`, merge commit `643e237`).

## 1. Goals and Decisions

Crumb returns to its original shape: a team member opens one page and sees their balance and their shelf at a glance; the admin side keeps only what is needed; any small shop (a bakery, a café, a bubble tea shop, or another small team) can download it, put in their own name, icon and wording, and use it without learning anything.

Decisions:

- **One page for team members**, with no sections to switch between and no bottom tab bar. Top to bottom: a one-line header → the "home screen" tip (until dismissed) → the main tile (name, credit label, pixel-font balance, collection slots, the next item "in the oven") → the action area → the log → the welcome line → the footer.
- **Two ways to spend**, chosen when the organization is set up and changeable by an owner at any time: **self-recorded** (a member keys in an amount and it is deducted at once) and **confirmed** (a member requests a benefit from the catalog and an admin confirms it before it is deducted). The default is self-recorded.
- **The admin side collapses to two pages**: "Team" holds treats, requests waiting, people, benefits and the log; "Settings" holds the organization settings, the spending mode and the activity log. The six sub-pages (Overview / Members / Benefits / Redemptions / History / Activity) go away; their old addresses (`#/team/members` and the like) land on the page that now holds them.
- **Batch treats**: one amount to several people at once.
- **The look returns to the original**: one white tile with a heavy bottom shadow, a pixel-font number, slots with inset shadows, a wood-coloured log bar, 3D buttons. The 2px-bordered cards and three-line header go.
- **Five animations**: the oven intro, the tile sliding in, the rolling number, pastries dropping into slots, crumbs when the mascot is tapped. No "bite".
- **Wording**: "recognition" becomes "treat" in the app's English strings, and 认可 becomes 下午茶 in Chinese. The README's tagline and summary line, which the public demo shares, are not rewritten this round.
- **Sign-in is unchanged**: team members use a personal link or QR code; owners and admins use a password.
- **Themes (a bakery set, a café set) wait for the next round**; this round keeps the pixel pastries.

## 2. The Member Page

Top to bottom:

1. **A one-line header.** Left: the mascot (the wife cake; the organization's logo when one is uploaded) and the team name; tapping the mascot shakes it and spills crumbs. Right: the member's name as a small pill; tapping it opens "Language" and "Sign out". There is no other navigation.
2. **The "Put Crumb on your home screen" card** (existing): for team members only, hidden on this device after "Got it".
3. **The main tile**:
   - the name;
   - the credit label (the organization's own wording, such as "Café credit"), small with letter spacing;
   - the available balance in the pixel font (drawn on a canvas; screen readers read the same amount as text);
   - the collection slots: six per row, showing the unlocked pastries, with empty slots filling out the next full row; tapping a slot shows the pastry's name;
   - "**{next} is in the oven**", with a small drawing of it; once everything is unlocked, "All {total} on the shelf. Treats still count, of course."
   - No total received, no count out of the total, no threshold: when the next pastry comes is a surprise, and nothing a member does can speed it up.
4. **The action area**, one of two depending on the spending mode:
   - Self-recorded: one button, "I grabbed something", opening a sheet (rising from the bottom on a phone, with a grip): "How much did you grab?", the available balance ("You’ve got $106.50 to spend"), a keypad (0–9, "Clear", "Delete last digit") and "Jot it down". Over the balance, the sheet says "Whoa, that’s more than you’ve got." and "Jot it down" cannot be pressed. On confirmation the amount is deducted at once, the big number rolls to the new value with a small dip, the log is replaced in place, and a toast says "Got it, $12.50. Long day? Take a breather."
   - Confirmed: the benefit list (icon if there is one, name, description, price, "I’ll have this"; "Almost there. A little more and it’s yours." when the balance is a little short) and "Your requests" (a waiting request can be cancelled). The line shows only when the member is short by more than nothing and by at most half the benefit’s price; with a bigger gap there is no line, and the price and the unavailable button stay as they are.
   - One line of grey text under it: a warm line for the day, one of seven chosen by the day of the month ("Tired? Have something sweet."), or one of four gentler lines while the available balance is zero ("Empty for now, and that’s fine. Thanks for today.").
   - After a switch to self-recorded, requests still waiting keep a "Your requests" tile until they are confirmed, declined or cancelled.
5. **The log**: a wood-coloured header, "Log · Recent", showing the latest five entries; "See all" turns it into "Log · Everything", grouped by month, with "Show more" loading 25 more at a time through the existing paged endpoint; "Fold up" goes back to five. Each recent row has four things: a diamond, a signed amount, a kind and a date. The kinds are: Treat, Jotted down, Redeemed, Refunded, Fixed (a taken-back treat and a put-right entry both read "Fixed"). A row that was corrected carries a badge as well: "Taken back" on a treat, "Put right" on an entry, "Refunded" on a redemption. Expanded, each row says a little more ("Treat from Priya", "You jotted this down", "A slip, put right") and a treat's message is a small line under it; the five recent rows never show it.
6. **The welcome line**: the organization's welcome text, small, at the very bottom. Nothing if it is not set.
7. **The footer**: contact your admin, feedback, version, smaller than before.

When treats arrived since this device last looked, the big number jumps up and a toast says "Someone treated you: +$30.00".

Owners and admins have this page too (called "Mine" in their navigation), since they can receive treats.

## 3. Spending Modes

The organization gets a `spending` setting: `self` (self-recorded) or `confirm` (confirmed). It is chosen at setup ("How people spend"), defaults to `self`, and an owner can change it in Settings at any time; the lock on the reward rules does not apply to it.

**Self-recorded**:

- A member calls `POST /api/me/spend` with an amount, its unit (`mode`) and an idempotency key. In one transaction the server checks that the account is active, the amount is above zero, the unit is the organization's current one, the amount is at most the current available balance, and, in points mode, a whole number.
- The entry is a ledger row with `kind = 'spend'`, negative, whose actor is the member, with no source row; the activity log gets a `spend.create` row.
- Mistakes are corrected by an admin: `POST /api/admin/spends/:id/void`, with a required reason, adds a positive row with `kind = 'void'` pointing at the spend; each spend can be corrected once (again: `ALREADY_CORRECTED`; not a spend: `ENTRY_NOT_FOUND`); the activity log gets a `spend.void` row. Members cannot undo their own entries.
- Neither `spend` nor `void` changes "treats received": the collection only counts treats.
- In this mode the member page shows no benefit list and a new request returns `SPENDING_MODE`. The benefits themselves are kept for a switch back. The other way round, in confirmed mode `POST /api/me/spend` returns `SPENDING_MODE` too; a page still showing the old way gets that answer and says to refresh.

**Confirmed**: unchanged.

**Switching**:

- Self-recorded → confirmed: the benefit list appears on the member page (empty until an admin adds to it); the "I grabbed something" button goes.
- Confirmed → self-recorded: the benefit list and "I’ll have this" go; requests still waiting stay in the member's "Your requests" and the admins' "Waiting on you" until they are confirmed, declined or cancelled.

The CSV export and the audit log carry the two new kinds in their existing formats.

## 4. The Admin Side

**Team** (`#/team`, owners and admins), one page, top to bottom:

1. The "Treat someone" button (see §6).
2. **Waiting on you**: shown in confirmed mode, or in self-recorded mode while requests are still unresolved. Each can be confirmed, declined, or cancelled for the member (existing).
3. **People**: "Invite someone" above the list; one row per person: name, role, username, available balance, received so far, status. The row is a button: opened, it shows the actions for that person (a new sign-in or invitation link, a password reset link, change role, deactivate or reactivate) and any link just made for them, with its QR code; one person is open at a time. The row of the manager themselves, and an admin's view of owners and other admins, has nothing to open. After a change made from a person's row the page is drawn again with that row open and the keyboard on it.
4. **Benefits**: shown in confirmed mode only. The list with "Add benefit" and "Edit"; when adding or editing, one of the theme's 39 pastries can be chosen as the icon ("Icon"), or "None", each named in the interface's language.
5. **Log**: the whole team's records, the latest 20, with "Show more" paging on. Each row offers the action for its kind, each with a required reason: a treat can be taken back ("Take back"), a self-recorded spend corrected ("Fix"), a completed redemption refunded ("Refund"); a corrected row carries its badge (Taken back / Put right / Refunded). A batch is one line (see §6). "Download ledger (CSV)" sits above it.
6. **Who did what**: for admins only, who have no Settings. The same activity log as in Settings, read-only, paged, across the width of the page below the Log. Owners read it in Settings and do not see it on Team.

**Settings** (`#/settings`, owners only), one page: organization (name, default language, welcome), reward rules (existing, with the same locks), **how people spend**, contact and feedback, logo, your data (the CSV download and the backup note), **who did what** (the former Activity page, at the bottom, paged; admins read it on Team, see above).

Permissions are unchanged: admins see Team but not Settings, and read the activity log (`GET /api/admin/audit`) as owners do; the server still re-checks everything.

## 5. Header and Navigation

- The header is always one line.
- Members: mascot or logo and the team name on the left, the name pill on the right, opening Language and Sign out.
- Owners and admins: on wide screens (720px and up) pills sit in the middle of the header, "Mine / Team / Settings" (admins have no Settings); on narrow screens these move into the name menu on the right, beside Language and Sign out. Escape closes the menu and puts the keyboard back on the name.
- The signed-out pages (sign in, join, reset password) are unchanged.

## 6. Batch Treats

- In the "Treat someone" dialog, "Who’s it for?" is a list with checkboxes of every active person (admins and yourself included, marked "(you)"), with "Everyone here" and "Clear" above it. With one person ticked it behaves exactly as before: the single-treat endpoint, and the button reads "Send it".
- One amount for everyone ("How much each"), one optional message ("A few words"). With two or more people ticked and a valid amount, the button reads "Treat 3 people · $60.00 all in".
- The server endpoint `POST /api/admin/grants/batch` (`userIds`, `amount`, `mode`, `reason`) runs the batch in one transaction: all recorded or none; each person gets their own `grant` row and their own unlocks, and the rows of one batch share a `batch_id`; the whole batch shares one idempotency key, the list is read as a set (the same people in another order are the same batch), and a resend returns the same result. An empty list, an inactive account in the list, or more than 500 people are refused.
- The audit log gets one row per person (the existing `grant.create`), whose detail carries the shared `batchId`.
- The Team page's log shows one batch as one line: the amount each, how many people, who gave it, the time and the message ("+$20.00 each", "3 people · …"); a batch whose rows run across pages of the log is still one line (every row carries the size of its batch). "See all" opens it to list each person with their own amount and their own "Take back", loaded in full whatever page the line came from. After one of them is taken back the page is drawn again with the batch still open. A batch of one shows as an ordinary row.

## 7. Look

The reference is the original benefits site; the app's stylesheet takes the same values. The public demo page (`index.html`) already has this look and does not change.

- Background: cream with the faint 24px grid (existing).
- Tile and sections: white, no border, bottom shadow `0 6px 0 rgba(122,74,38,.18), 0 10px 26px rgba(74,47,27,.1)`, 20px radius.
- Slots: 42px, 10px radius, 2.5px border `#a9793f`, inset shadow dark at the top and light at the bottom.
- Buttons: solid wood, bottom shadow `0 5px 0`, moving down 4px when pressed; secondary buttons the same in a lighter colour.
- Log bar: wood header, gold diamond, dashed lines between rows.
- Overlays: on phones a sheet rising from the bottom with a grip; on wide screens a centred dialog. The existing `<dialog>` mechanism stays; only the styling changes.
- Toasts drop in from the top; on a phone they come in under the header, however tall large text makes it.
- Small text keeps the darker shade so it passes WCAG AA.
- The admin side uses the same set: sections are white tiles, lists are dashed rows, form controls follow the original keypad and sheet.
- With `prefers-reduced-motion` every animation is off and nothing else changes.

## 8. Animations

Five, all ported from the plain JavaScript the public demo already has (`ovenIntro`, the rolling number, the dropping slots and the crumbs in `assets/app.js`), in `app/motion.js`:

1. **The oven intro**: when someone already signed in opens the page, the mascot pops in with "Today’s treats are out of the oven!" and "Tap to skip", starts to leave after 0.9 seconds (the slide out takes 0.42 seconds), and a tap skips it. Once per page load; moving between pages does not replay it, and the sign-in page and sign-in links never show it.
2. **The tile slides in** from above once the intro leaves, on that one occasion.
3. **The rolling number**: from the balance last seen on this device to the current one; after each entry from the old value to the new, with a small dip on a deduction and a small jump on an increase. "Last seen" is kept in browser storage under `crumb.seen.<member id>` as three numbers only (balance, pastry count, total received), and only for the person signed in on that browser now: it is removed when they sign out, and as soon as the page finds no one, or someone else, signed in there (a new sign-in link, deactivation, an expired session), also when the page was closed at the time and only finds out on its next load.
4. **Pastries drop into slots**: on the first look every pastry drops one by one (70 ms apart); later only those unlocked since this device last looked.
5. **Crumbs from the mascot**: tapping the wife cake in the corner shakes it and spills crumbs.

With less motion asked for there is no intro, no pastry drops, and the number is drawn at its new value at once.

Not done: the mascot taking a bite after a spend (the member side has no matching moment).

## 9. Wording

"Recognition" is replaced throughout both languages' app strings, in one direction. The final wording:

| Where | Chinese | English |
| --- | --- | --- |
| Team page button, dialog title | 请下午茶 | Treat someone |
| A log entry, expanded | Priya 请的 +$25.00 | Treat from Priya +$25.00 |
| Total (a person's row on the Team page) | 一共收到 | Received so far |
| Batch button | 请 3 个人 · 共 $60.00 | Treat 3 people · $60.00 all in |
| Intro | 今天的下午茶出炉啦 | Today’s treats are out of the oven! |
| Taking a treat back | 收回 | Take back |
| Correcting a self-recorded entry | 改一下 | Fix |
| Badge on a taken-back treat | 收回了 | Taken back |
| Badge on a corrected entry | 改回了 | Put right |
| The spending button | 我拿了东西 | I grabbed something |
| The keypad's confirm | 记下 | Jot it down |
| Treats arrived | 有人请你下午茶啦，+{amount} | Someone treated you: +{amount} |
| The two spending modes | 自己记 / 要确认 | Self-recorded / Confirmed |

The member log uses short kinds only: 下午茶 / 自己记的 / 兑换 / 退回 / 改动 (Treat / Jotted down / Redeemed / Refunded / Fixed). Every other string is as in `app/locales/en.js` and `app/locales/zh-CN.js`.

The README's tagline and summary line, which the public demo shares, are not rewritten this round; the rest of it follows the new wording, and it gains a "Make it yours" section with one sentence to explain the name: eat the bread and the crumbs stay.

## 10. Data and Endpoints

Migration `002`:

- `organization` gains `spending TEXT NOT NULL DEFAULT 'self' CHECK (spending IN ('self','confirm'))`. An existing organization becomes confirmed if it already has benefits, self-recorded otherwise.
- The `ledger.kind` constraint widens to `('grant','revoke','redeem','refund','spend','void')`, with the sign and source-row constraints adjusted: `grant`, `refund` and `void` are positive; `grant` and `spend` have no source row; a new `batch_id` column is allowed on `grant` rows only. SQLite cannot alter a constraint, so the migration creates a new table, copies the rows, drops the old one, renames, and recreates the indexes (plus `ledger_by_batch`) and triggers; rows and ids stay the same.
- `rewards` gains `icon_key TEXT`, nullable (2 to 32 characters); the server accepts only a key of the theme.
- Migrations run in one transaction with foreign keys off (the only way SQLite allows rebuilding a table others refer to). After a migration has run and before it commits, every reference is checked; if any would point at a missing row the whole update is refused and nothing changes, and Crumb does not start, naming the first rows. A database that is already current is not checked: an unrelated stray row must not keep Crumb, or owner recovery, from starting.

Endpoints:

- `POST /api/me/spend` (member, idempotent); `POST /api/admin/spends/:id/void` (admin, idempotent, reason required).
- `POST /api/admin/grants/batch` (admin, idempotent), returning `{ batchId, count, units, unlocked, entries }`.
- `PATCH /api/org` accepts `spending`; so does `org` in `POST /api/setup`.
- `GET /api/me` and `GET /api/session` return `org.spending`; `GET /api/rewards` and the admin benefit endpoints carry `iconKey`; `GET /api/admin/rewards` also returns the theme's keys and their names in three languages, so the icon picker offers exactly the keys the server accepts.
- The ledger views (`/api/me/ledger`, `/api/admin/ledger`) have the two new kinds and carry `batchId` and three flags: `corrected` (a treat taken back or a spend put right), `revoked` (treats only) and `refunded` (a redemption given back, its own flag, not part of `corrected`). `/api/admin/ledger` rows also carry `batchSize`, and the endpoint takes `?batchId=` to list one batch in full.
- `GET /api/me/redemptions` takes `?status=`: after a switch to self-recorded, the member page lists every request still waiting with it.
- In self-recorded mode `POST /api/redemptions` returns `SPENDING_MODE`; in confirmed mode `POST /api/me/spend` does.
- The CSV kind column carries the new kinds.

## 11. Make It Yours

The aim is download, change the settings, use — without touching code:

- Changed without code: team name, logo, default language, credit label, credit or points, currency, unlock threshold, welcome text, spending mode, contact link, feedback link. All of it is in setup and Settings.
- Changed with one file: the whole set of pastries (`docs/THEMES.md`). Themes are not built this round, but benefit icons come from the theme, so the hook is ready for the next one.
- The README has a "Make it yours" section listing both, and says the typical user is a small shop such as a bakery, a café or a bubble tea place, while any small team can use it.

## 12. Not in This Round

- Themes (breads and cakes for a bakery, coffees for a café): next round, chosen at setup and locked after the first unlock.
- Separate member pages, a tab bar, a feed of thank-you messages.
- Members undoing their own entries.
- The "bite" animation.
- The open items already on the list (account lockout, admins treating themselves, anonymous session rows, and so on) stay where they are.

## 13. Tests and Acceptance

Unit tests (`node --test`):

- Self-recorded spending (`tests/spending.test.mjs`, `tests/api.test.mjs`): zero or negative refused; more than the available balance refused; a fraction in points mode refused; a deactivated account refused; refused in confirmed mode; a resend with the same idempotency key returns the same result; `spend` leaves treats received and the shelf unchanged.
- Correction: only a `spend` can be voided; once each; the available balance is restored; the collection is untouched; also over HTTP.
- Batch (`tests/batch.test.mjs`, `tests/api.test.mjs`): an empty list, an inactive account, or more than the limit refused; a failure part-way records nothing; each person unlocks on their own; a resend returns the same result; one audit row per person with a `batchId`; every row of the Team log carries its batch's size, and `?batchId=` lists one batch.
- Spending mode (`tests/org.test.mjs`, `tests/redemptions.test.mjs`): defaults to `self`; chosen at setup; owners can change it, admins cannot; in self-recorded mode the request endpoint returns `SPENDING_MODE`; after switching to self-recorded, waiting requests can still be resolved.
- Benefit icons: a key outside the theme refused; null allowed; an edit without an icon keeps it.
- Migration (`tests/db.test.mjs`): a real schema-1 database file, built from `001-initial.sql`, is upgraded: the ledger keeps its rows, sums and rowids, every index and trigger is present, and the widened constraint accepts the new kinds and still refuses the wrong sign; one with benefits comes up confirmed; an update that would leave a dangling reference is refused and changes nothing; a database already current opens with an old stray row in it.
- Wording (`tests/i18n.test.mjs`): English and Chinese keys and placeholders match; every key the app asks for exists and every defined key is used; "recognition" no longer appears in the app strings.

Browser tests (Playwright; `tests/e2e/one-page.spec.mjs` and the others):

- Member page, self-recorded: after an entry the big number changes and the log shows "Jotted down"; over the balance the sheet shows an error and cannot confirm.
- Member page, confirmed: benefit list and requests on one page; a request appears under "Your requests".
- After an owner changes the spending mode, a reload of the member page shows the change; a request left waiting by a switch to self-recorded still shows and can still be confirmed.
- Team, one page: a treat, a batch treat to three people, a batch running across log pages still one line and opening to all 25 people, waiting, people (a row opened, and open again after a change), benefits (confirmed mode), the log and a correction, all workable on one page.
- Who did what: an admin reads it at the bottom of Team, with nothing in it to press; the owner's Team page neither shows nor fetches it, and their Settings still shows it.
- Header: at phone width the name menu holds Language and Sign out, plus Mine, Team and Settings for an owner; at desktop width the pills are visible; a team member has no navigation.
- The intro can be skipped with a tap; under `prefers-reduced-motion` there is no intro and no pastry drops, and the page works.
- A phone keeps no last-seen balance once the server signs its member out.
- The existing `available-balance` test id stays; the member page no longer shows a count, so the tests that read `collection-count` count the filled slots instead.
- The existing accessibility checks pass on the member page in both modes, the keypad, the Team page, the treat dialog and Settings, at 390 px and 1440 px.

The acceptance record goes into `docs/VALIDATION.md` in its existing form: unit tests, browser tests and the operations drill from a fresh clone, with anything not run marked "not verified".

## 14. Documentation

- `README.md` and `README.zh-CN.md`: "What each side sees" rewritten for the new pages; the "Make it yours" section and the sentence about the name; both spending modes, batch treats, corrections and benefit icons in the version contents; screenshots retaken (the member page, the keypad, the Team page treating three people).
- `docs/OPERATIONS.md`: switching the spending mode, correcting a self-recorded spend, what a batch looks like in the log and the audit log, upgrading from 0.1.
- `docs/THEMES.md`: benefit icons are keys of the theme.
- `docs/DEPLOYMENT.md`: points to the upgrade note; the browser keeps a fourth thing.
- `index.html` (the public demo) must say the same as the README (the existing test checks).
- `docs/VALIDATION.md` and `docs/RELEASE-CHECKLIST.md` updated for this round.

## 15. Assumptions (built as approved)

The design was approved on these assumptions, and they are built as written:

1. The default spending mode is self-recorded; the `npm run demo` sample team uses it too, and the README says how to switch to confirmed.
2. When an existing database is upgraded, the migration sets the spending mode to confirmed if benefits already exist, otherwise to self-recorded.
3. The member page shows no total received, no count out of the total and no threshold (a person's row on the Team page shows the total).
4. The treat message stays optional; members see it only in the expanded log.
5. The self-recording sheet takes an amount only: no item, no note.
6. The Team page log shows the latest 20 entries by default, paged once expanded.
7. The intro plays once per page load (a refresh plays it again), not once a day.

## 16. Where the Build Differs from the Approved Design

- **The line under the action area**: not one fixed hint per spending mode but a line for the day, changing by the day of the month (seven lines), with a gentler set (four lines) while the available balance is zero.
- **Final wording**: as in the table in §9. Different from the approved design: "Treat someone / 请下午茶", "Take back / 收回", "Fix / 改一下", "Put right / 改回了", "Jotted down / 自己记的", the kind "Fixed / 改动", the intro "Today’s treats are out of the oven! / 今天的下午茶出炉啦", and the batch button "Treat 3 people · $60.00 all in / 请 3 个人 · 共 $60.00"; the rest as in `app/locales`.
- **Treats that arrived**: when treats arrived since this device last looked, the member page says "Someone treated you: +{amount} / 有人请你下午茶啦，+{amount}".
- **A batch in the Team log**: one line with the amount each and the number of people, which opens to list each person with their own "Take back".
- **People**: each row opens to show that person's actions, so a long team stays short on a phone.
- **The "Refunded" badge**: a redemption given back has its own badge and its own `refunded` flag, not counted as a correction.
- **The last-seen numbers**: kept on the device per person, only for whoever is signed in there now, and forgotten at sign-out and whenever the page finds no one, or someone else, signed in.
- **Request keys in the browser** (`crumb.pending`): for each unanswered change, its key and a fingerprint of the change, with the person's id, the kind of change and when it was sent. They stay in this browser until an answer arrives, are used for at most seven days (an older one is deleted the next time Crumb is opened in this browser), and are kept only for whoever is signed in there now: like the last-seen numbers, they are removed when the person signs out or someone else signs in on this browser, and whenever the page finds no one signed in. The fingerprint of a small change, such as an amount, could be worked out by someone using the same browser before then. Someone who signs out with a change unanswered loses the notice that it was not confirmed.
- **Signing out needs the server** (decided after the review): a sign-out counts only once the server confirms that this browser's session is over. One runs at a time, and one with no answer within ten seconds counts as not done. One turned down because the same person signed in again in another tab is sent once more; if someone else has signed in on this browser since, that sign-in already ended the leaving person's session, so the sign-out counts and the other person stays signed in. Until a sign-out counts nothing in the browser is cleared, and the page stays signed in and says so; once it counts, the page shows what the server says now, and the sign-in page even when the server's next answer does not arrive.
- **Who did what for admins** (decided after the review): the approved design put the activity log in Settings only, which admins cannot open. Admins read it, read-only, at the bottom of the Team page, as they could read the Activity page in 0.1; owners read it in Settings only.
- **The migration's reference check**: made only after a migration ran; if references would dangle, the update is refused and nothing changes.
- **Read endpoints added**: `GET /api/me/redemptions?status=`, the theme's keys and names with `GET /api/admin/rewards`, and `batchSize` and `?batchId=` on `/api/admin/ledger` (see §10).
