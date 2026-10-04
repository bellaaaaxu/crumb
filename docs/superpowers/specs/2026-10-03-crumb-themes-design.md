# Crumb: Collection Themes (Pastry Shop, Bakery)

*Translated from the Chinese original, [2026-10-03-crumb-themes-design.zh-CN.md](2026-10-03-crumb-themes-design.zh-CN.md).*

Status: design approved (2026-10-03), not yet implemented.
Baseline: 0.2.0 (`main`, merge commit `bbfda7f`).

## 1. Goals and Decisions

The same Crumb, in a different coat, for a different kind of shop. A team picks a "collection theme" when it is set up; the pictures on the shelf, the mascot and the few sentences that talk about those pictures all follow that theme. The collection rules do not change: every time someone's treats add up to another step, one more item unlocks, and spending never takes one away.

Decisions:

- **Two themes**: **Pastry shop** (today's 39 pastries, wife-cake mascot, theme id still `default`) and **Bakery** (24 breads and cakes, "Bitten Toast" mascot, id `bakery`). A café theme is the next round.
- **Only the pictures and a few sentences change**: how items are earned and ordered, and that spending never removes one, stay exactly as they are. The pixel style, the name Crumb and the colours do not change.
- **Chosen at setup**, defaulting to Pastry shop. **Until the first treat**, an owner can change it in Settings; after that it is fixed, together with the unlock step.
- **Changing the theme before it is fixed**: benefit icons the new theme does not have are removed, and the owner is told how many. Icons the two themes share are kept.
- **Approach: one sketchbook, several lists.** Every drawing lives in `assets/sprites.js`, drawn once; a theme is a list (which drawings, which one is the mascot, what the theme is called). The 12 items the two themes share exist once in the sketchbook. To add a theme, someone draws and lists it in that file, runs one command, and registers the new keys in the test list (§10).
- **Teams already using Crumb** are on Pastry shop after the upgrade: their collections, mascot, icons and theme sentences do not change. An owner's Settings gains the theme cards (greyed out once a treat has been sent), and the lock notices now mention the collection theme (§4, §6).
- **The public demo** gets a "Pastry shop | Bakery" switch; a first-time visitor sees Pastry shop, and switching plays the "shutter" animation (§7.1).

## 2. What Each Theme Holds

**Pastry shop** (`default`): today's 39, with the same contents, order and keys. The demo still rotates 33 of them; the other 6 can only be earned in the self-hosted app (as today).

**Bakery** (`bakery`), 24 items:

- **12 shared with Pastry shop** (same key, same drawing): Pineapple Bun `bolo`, Pineapple Bun with Butter `boloyau`, Cocktail Bun `gaimei`, Sausage Bun `sausage`, Cream Bun `creambun`, Cheese Hot Dog Bun `cheesehotdog`, Triangle Cake `caketriangle`, Black Forest Cake `blackforest`, Mango Mousse Cake `mango`, Swiss Roll `swissroll`, Paper-Wrapped Cake `papercake`, Chestnut Cake `chestnut`.
- **The mascot**, 1 item: Bitten Toast (see §3).
- **11 new drawings**:

| Key | Simplified | Traditional | English | Drawing notes |
| --- | --- | --- | --- | --- |
| `croissant` | 牛角包 | 牛角包 | Croissant | crescent, in layers |
| `baguette` | 法棍 | 法棍 | Baguette | diagonal, a few score cuts |
| `loaf` | 山形吐司 | 山形吐司 | Loaf | a whole loaf with a domed top |
| `bagel` | 贝果 | 貝果 | Bagel | a ring with sesame |
| `pretzel` | 椒盐卷饼 | 椒鹽卷餅 | Pretzel | a knot |
| `cinnamonroll` | 肉桂卷 | 肉桂卷 | Cinnamon Roll | swirl with icing, unlike the Swiss roll's cut face |
| `strawberrycake` | 草莓蛋糕 | 草莓蛋糕 | Strawberry Cake | a whole round cake, strawberries on top |
| `cupcake` | 纸杯蛋糕 | 紙杯蛋糕 | Cupcake | a peaked swirl of cream |
| `donut` | 甜甜圈 | 甜甜圈 | Donut | pink icing |
| `tiramisu` | 提拉米苏 | 提拉米蘇 | Tiramisu | a square, cocoa on top |
| `madeleine` | 玛德琳 | 瑪德蓮 | Madeleine | shell-shaped |

- **How they are drawn**: they keep the format in `docs/THEMES.md` (12×12, `.` transparent, `#RRGGBB` palette) and the style of the existing sprites, which this round writes into THEMES.md as a "Drawing rules" section: flat fills; 3 to 5 colours including the outline; no faces; the outline `X` is a dark shade of the item's main hue — baked-brown items use a dark brown (most existing ones share `#7A4A1E`), items that are not brown use a darker shade of their own colour (taro `#6E4E86`, mochi `#6B7F3E`). Their shapes stay distinct from one another, and no more triangle cakes are added.
- **Each drawing (the mascot included) is shown to the maintainer** and is final only once approved. One that cannot be recognised at header size is swapped for one of the reserves: boule, canelé, pudding, sandwich, cream puff, muffin, French toast, birthday cake. A swap changes the key and names with it, and every place in this document that uses the key changes at the same time: §2's table and list order, §4's card preview and the pictures on §7's demo cards; if `croissant` is the one swapped, §7's line "“Croissant is in the oven”" also takes the new item's English name.
- **The Bakery list order** (also its rotation in the demo; Bakery has no app-only items): `toastbite`, `croissant`, `bolo`, `strawberrycake`, `baguette`, `gaimei`, `cupcake`, `loaf`, `caketriangle`, `bagel`, `sausage`, `donut`, `cinnamonroll`, `swissroll`, `pretzel`, `creambun`, `tiramisu`, `boloyau`, `madeleine`, `blackforest`, `cheesehotdog`, `mango`, `papercake`, `chestnut`.
- In the self-hosted app, each person's shelf still fills in its own order by `SHA-256(userId:key)`, so the list order does not affect it. In the demo, each person still starts at their own point in this rotation.

## 3. The Mascot: Bitten Toast

A slice of toast with a small bite out of its top-right corner and three crumbs beside it. No face. It is also one of the Bakery collectibles (key `toastbite`, Bitten Toast / 咬一口吐司), just as the wife cake is one of the Pastry shop's.

```js
toastbite: { palette: { X: '#6B3F17', C: '#CF8A34', I: '#FCE6B4', D: '#A8641F' }, rows: [
  '..XXXXX....C',
  '.XCCCCCX.C..',
  'XCCIIIIX...C',
  'XCIIIIIIXX..',
  'XCIIIIIIIIXX',
  'XCIIIIIIIICX',
  'XCIIIIIIIICX',
  '.XCIIIIIICX.',
  '.XCIIIIIICX.',
  '.XCIIIIIICX.',
  '.XDDDDDDDDX.',
  '.XXXXXXXXXX.',
] },
```

Everywhere the mascot appears follows the theme: the header (when no logo is uploaded), the oven intro, the brand on the sign-in and setup pages, the crumbs spilled when it is tapped (in the mascot's outline colour `X`, in the app and the demo alike), the browser tab icon and the home-screen icon.

## 4. Setup and Settings

**The cards**: one card per theme, drawing the first three items of that theme's list (the first is the mascot), with the theme's card text (§6) underneath. Pastry shop draws `laopo`, `tart`, `mungbean`; Bakery draws `toastbite`, `croissant`, `bolo`.

**Setup**: the "Your organization" group (`setup.orgGroup`) gains a "Collection theme" choice right after the unlock step: two cards, Pastry shop selected by default. Whichever card is selected, the mascot at the top of the page and the unlock-step hint switch to that theme's.

**Settings** (owners only): the same two cards, in the "Rewards" part (`settings.rewardsTitle`) right after the unlock step.

- Tapping a card only selects it; it takes effect on Save. While a card is selected but not saved, the unlock-step hint follows it (as the hint already follows an unsaved reward type); the header mascot keeps the saved theme, and after Save the page refreshes in the new theme.
- **Before the first treat**: it can change. Saving removes, in the same write, the benefit icons the new theme does not have. If at least one was removed, the "Theme changed…" sentence (§6) shows instead of "Settings saved."; if none was, "Settings saved." shows as usual.
- A team whose benefits already have prices but which has sent no treat sees `settings.lockedByBenefits` (the sentence revised in §6), and the theme cards stay selectable.
- **After the first treat**: the cards are greyed out and Settings shows `settings.locked` (revised in §6). The server refuses too, with the existing `RULES_LOCKED`.
- The condition is exactly the unlock step's: any entry in the ledger fixes it. At that point nobody has unlocked anything yet, so changing the theme never touches anyone's collection.

## 5. What Changes on Each Page

A Bakery team sees:

- **Member page**: the shelf, "{name} is in the oven" and benefit icons use Bakery drawings and names.
- **Header, oven intro, tapping the mascot**: all Bitten Toast. A team with an uploaded logo still shows its logo in the header.
- **Sign-in and setup pages**: the brand mascot follows the theme (on setup, the selected card).
- **Team page**: a benefit's icon is chosen from the Bakery's 24, named in the interface's language.
- **Browser tab icon, home-screen icon**: Bitten Toast. A page that is already open switches its tab icon after signing in, after setup and after a theme change in Settings, without a reload. An icon already on a phone's home screen keeps its old picture until it is added again (written up in the operations guide).
- **Unchanged**: colours, layout, how long and how often animations run, every collection rule.

A Pastry shop team's shelf, mascot, icons and the theme sentences of §6 are exactly as in 0.2. The only changes every team gets are: the theme choice on setup; the theme cards in an owner's Settings (greyed out after the first treat); and the revised `settings.locked`, `settings.lockedByBenefits` and `setup.rulesNote` (§6).

## 6. Wording

**Sentences that follow the theme**: Pastry shop keeps its sentences word for word; Bakery has its own:

| Where | Pastry shop (unchanged) | Bakery |
| --- | --- | --- |
| After a treat is sent | 顺便烤出了 {count} 件新点心。<br>And that baked {count} new pastry(ies). | 顺便又烤好了 {count} 件。<br>And {count} more came out of the oven. |
| Taking a treat back (last sentence) | 已经出炉的点心不会收走。<br>Pastries already baked stay on the shelf. | 已经出炉的面包和蛋糕不会收走。<br>Bread and cakes already baked stay on the shelf. |
| Team page, the "Member" role | 看自己的下午茶和点心，自己花。<br>Sees their own treats and pastries, and spends. | 看自己的下午茶和面包蛋糕，自己花。<br>Sees their own treats and bakes, and spends. |
| Unlock-step hint (credit and points) | …就多一件点心。<br>…a new pastry comes out of the oven. | …就多出炉一件。<br>…a new bake comes out of the oven. |

"{name} is in the oven", "Today’s treats are out of the oven!" and "All {total} on the shelf" are shared by both themes.

**Where these sentences live**: a theme's own version goes in both language files, keyed as the base key plus `.<theme id>`: `setup.thresholdCredit.bakery`, `setup.thresholdPoints.bakery`, `grant.unlocked.bakery`, `revoke.explain.bakery`, `members.roleDetail.member.bakery`. Pastry shop (`default`) has no such keys and uses the base keys. `app/i18n.js` holds the list of base keys that follow the theme and a lookup that uses the theme's version when there is one and the base key otherwise (looking up a key that may not exist with `t()` directly is not allowed: when nothing matches, `t()` shows the key itself). On setup the theme is the selected card's; everywhere else it is the team's.

**A theme's name and card text** live in its entry in `assets/sprites.js` (§9), in both languages, with the item count written as `{count}` and computed from the list, never typed in.

**New strings**:

| Where | Key | Chinese | English |
| --- | --- | --- | --- |
| Title of the choice | `settings.theme` | 收藏主题 | Collection theme |
| Pastry shop card | theme entry `default` | 饼店 · {count} 款点心 | Pastry shop · {count} pastries |
| Bakery card | theme entry `bakery` | 面包店 · {count} 款面包和蛋糕 | Bakery · {count} breads and cakes |
| Saved a theme change that removed icons | `settings.themeChanged` | 主题换好了。有 {count} 个福利的配图新主题里没有，已经去掉，可以重新配。 | Theme changed. {count} benefit icon(s) aren’t in this theme, so they were removed. You can pick new ones. |

**Three revised sentences** (the collection theme added to the existing ones):

| Key | Chinese | English |
| --- | --- | --- |
| `settings.locked` | 已有奖励记录，奖励方式、币种、解锁台阶和收藏主题已经固定，过去的数额保持原意。 | Rewards have been recorded, so the reward type, currency, unlock step and collection theme are fixed. Earlier amounts keep their meaning. |
| `setup.rulesNote` | 奖励方式和币种，在第一个福利定价或第一次请下午茶之前都能改；解锁台阶和收藏主题在第一次请下午茶之前能改。之后就定住了，免得以前的数额变了意思。 | Reward type and currency can change until the first benefit is priced or the first treat goes out; the unlock step and collection theme until the first treat. After that they’re set, so earlier amounts keep meaning the same thing. |
| `settings.lockedByBenefits` | 已有福利按这个单位定价，奖励方式和币种已经固定。解锁台阶和收藏主题在记下第一笔奖励之前仍可修改。 | Benefits already have prices in this unit, so the reward type and currency are fixed. The unlock step and collection theme can change until the first reward is recorded. |

When the server refuses a theme change after the lock, the existing `error.RULES_LOCKED` ("These reward rules are fixed now that rewards are recorded.") is reused; no new sentence is added.

## 7. The Public Demo

- **The switch**: two buttons, "Pastry shop | Bakery", next to "Take control" and outside `.stage` (pressing them does not count as taking over, so the tour keeps going). Choosing one plays the shutter (§7.1), and behind the shutter the shelf, the mascot (header, app icon, oven intro, "bite", browser tab icon), the cabinet and the small pictures on the three cards switch to that theme. If the tour is playing, it starts again from the beginning after the switch, without the oven intro.
- **Default and memory**: a first visit shows Pastry shop. The chosen theme is stored in the visitor's own browser under its own key (not inside `crumb_demo_v1`), and "Reset the demo" does not clear it; if that storage cannot be read or written, the page behaves as if nothing was remembered. A page opened with a remembered theme draws that theme straight away, with no animation.
- **The mascot button's accessible name** follows the theme: Pastry shop keeps "Mascot: wife cake"; Bakery is "Mascot: bitten toast".
- **Crumbs**: the crumbs spilled by tapping the mascot and by the "bite" take the current mascot's outline colour.
- **Numbers follow the theme**, computed from the list instead of typed in: the "Collectibles" stat and the cabinet's "All {n}" are the theme's total; the legend's first line, "In this demo’s rotation — {n}", is the rotation's size; the second, "Also collectible in the self-hosted app — {n}", shows only when the theme has such items, and the cabinet still marks them dashed. Pastry shop stays 33 / 6; Bakery shows a single line of 24.
- **Bakery wording** (the demo is in English):

| Where | Pastry shop (unchanged) | Bakery |
| --- | --- | --- |
| Tour, first line | Sam is six months in. Six pastries on the shelf, $84.25 to spend. | Sam is six months in. Six bakes on the shelf, $84.25 to spend. |
| Tour, last line | Alex, two years in: nineteen pastries — and not one of them the same as Sam’s. | Alex, two years in: nineteen bakes, in an order nobody else has. |
| Toast after spending | …the shelf keeps every pastry 🍞 | …the shelf keeps every bake 🍞 |
| Steps on the right | watch a pastry come out of the oven<br>different pastries, same rule | watch a bake come out of the oven<br>different bakes, same rule |
| First card | …and your pastries stay.<br>$50 received = 1 pastry | …and your bakes stay.<br>$50 received = 1 bake |
| Second card | “Egg Tart is in the oven” | “Croissant is in the oven” |
| Cabinet heading | The pastry cabinet | The bakery case |

  The three cards' pictures for Bakery: `toastbite`, `croissant`, `bolo`; `cupcake`; `donut`, `pretzel`, `mango`, `bagel`.
- **Unchanged**: the summary at the top of the page, the origin story (the third card's text), the link-preview image (`assets/og.png`) and its text, and the theme shown in the README screenshots all stay Pastry shop.

### 7.1 Switch Animation: the Shutter

References: [Motion's Shutter](https://motion.dev/docs/curtains) (cover, swap, reveal) and [an OPEN/CLOSED sign flip](https://codepen.io/aimieisanxious/pen/vzwrbM).

1. **0–300 ms**: a wood-coloured roller shutter drops from the top of the phone in 8 steps and covers its screen. It has horizontal slats (a dark seam every 12px) and, a little above the middle, a cream sign that shows the current shop in the existing pixel font: `PASTRY SHOP` or `BAKERY`.
2. **300–550 ms**: the sign squashes sideways to a line (3 steps), changes to the new shop's name at its narrowest, and opens again (3 steps). Meanwhile, behind the shutter, the shelf, the mascot and the "in the oven" line switch; the cabinet and the cards are outside the phone and switch at once.
3. **550–650 ms**: the sign wobbles twice.
4. **650–950 ms**: the shutter rolls up in 8 steps.
5. **Then**: the items on the shelf pop in one after another (the existing `slotPop`), new stock on the shelf.

- About 1.1 seconds in all. The sign flips by squashing sideways only, never a 3D rotation, so the pixels stay sharp.
- The shutter and sign are a layer inside the phone, built the same way as the existing oven intro; no library, and it works when the page is opened straight from disk.
- **Reduced motion** (`prefers-reduced-motion`): no shutter, an instant switch.
- Demo only. In the app, Settings simply refreshes in the new theme after Save, with no animation.

## 8. Data and API

- **Migration `003-theme.sql`**: `organization` gets `theme TEXT NOT NULL DEFAULT 'default'`, checked for shape only (2 to 32 characters). Which themes exist is decided by the theme list files, not by the constraint, so adding a theme never rebuilds the table. An existing database is on `default` after the upgrade.
- **Theme list files**: `themes/default.json` and `themes/bakery.json`, both generated by `scripts/theme-manifest.mjs` from `assets/sprites.js` and never edited by hand. Each has `themeId`, `version`, `source`, `mascot`, `keys` and `names` (`en`, `zh-Hant` and `zh-CN` for each key). A new small module, `server/themes.mjs`, reads every list; the server, the database check and restore all take them from it.
- **Unknown themes**:
  - On opening a database (`openDatabase` in `server/db.mjs`, after migrations, where "this database comes from a newer version" is checked), a team whose theme is not one of the shipped lists is refused with code `THEME_UNKNOWN`: "This database uses the collection theme "{id}", which this version of Crumb does not include. Run a newer Crumb, or restore a backup made by this version." A database that has no team yet opens as usual. The server, `npm run demo` and `recover-owner` all open the database this way, so they all refuse; the server prints "Crumb cannot start: …".
  - On restoring a backup (`restoreDatabase` in `server/backup.mjs`), the same check runs after the version check and before anything is written. Only backups at schema 3 or later that already have a team are checked; schema 1 and 2 backups, and backups taken before setup, count as `default` and restore as usual.
  - Like `SCHEMA_TOO_NEW`, `THEME_UNKNOWN` only ever appears on the server, so it joins the exemption list in `tests/i18n.test.mjs` and gets no interface string.
- **The server works with the team's theme**: unlock order and cap, the `theme` in `/api/me` (`id`, `size`, `complete`, `next`) and the collection's names, and the `theme` sent with `GET /api/admin/rewards` (`keys`, `names`) all use the team's theme instead of a hard-coded `default`.
- **The benefit-icon check** has two parts. The shape check stays where requests are read (absent means unchanged, `null` or `''` means no icon, otherwise 2 to 32 characters). Whether the key belongs to the team's theme is checked inside the write transaction. For a new benefit sent with a request key, that check sits inside the idempotent operation, next to the existing unit check (`assertSameMode`): a retry whose first attempt succeeded but whose answer was lost gets that stored answer even if the theme changed in between, and a refused add stores nothing. For an edit it runs in the same write transaction.
- **Setup**: `POST /api/setup` takes an optional `theme` in `org` (`default` when absent; an unknown theme fails the existing field validation). The `org.setup` audit row records `theme`.
- **Settings**: `PATCH /api/org` takes an optional `theme`. Changing it once the ledger has an entry returns `RULES_LOCKED`. The response is still the signed-in organization, plus a top-level integer `iconsRemoved`: how many benefits (active or not) had their `icon_key` set to `null` by this request; 0 when the theme did not change or every icon was shared. The field is only in this response, not in the organization itself. Removing the icons and changing the theme happen in one transaction. When the theme changed, the `org.update` audit detail is `{ changed: [..., 'theme'], theme: { from, to }, iconsRemoved }`; otherwise it stays `{ changed }`.
- **The organization in the session**: signed in, it gains `theme` and `locks.theme`; signed out (the sign-in page), it carries `theme` too. The page's own signed-out organization (built in `app/main.js` when a confirmed sign-out's follow-up question about who is signed in gets no answer) carries `theme` as well. Anywhere the page looks up a mascot from the team's `theme`, a missing or unknown id draws Pastry shop's mascot and never throws.
- **Icons**:
  - Pastry shop keeps today's files: `app/favicon.svg` (still the hand-drawn one; no script writes it) and `app/icons/icon-{180,192,512}.png`. Every other theme has `app/icons/<id>/favicon.svg` and `app/icons/<id>/icon-{180,192,512}.png`, generated from its mascot by `scripts/make-icons.mjs`.
  - The server answers `/favicon.svg`, `/icons/icon-180.png`, `/icons/icon-192.png` and `/icons/icon-512.png` (the web manifest's icons use these addresses too) according to the team's theme; before setup it serves Pastry shop's.
  - After the session loads, after setup and after a theme change in Settings, the page points `<link rel="icon">` and `<link rel="apple-touch-icon">` at the theme's own addresses, so the tab icon changes without a reload.
  - GitHub Pages has no server, so it serves Pastry shop's. This is about `app/`'s icons; the demo's tab icon is in §7.

## 9. Drawings and Files

- **`assets/sprites.js`**:
  - 12 new drawings (the 11 new items and the mascot).
  - Every key in `NAMES` gains a Simplified Chinese name, `cn` (moved here from `SIMPLIFIED` in `scripts/theme-manifest.mjs`, so everything about a theme lives in this one file).
  - A new `THEMES` table: each theme is `{ mascot, rotation, limited, version, label, card }`. `rotation` is the demo's rotation; `limited` holds the items that can only be earned in the app (Pastry shop's is today's `LIMITED`; Bakery's is empty); a theme's keys (the list file's `keys`) are `rotation` followed by `limited`. Pastry shop: `rotation` is today's `CYCLE` (33, the same array) and `limited` is `LIMITED` (6), so `default.json`'s keys do not change and its version stays 1. Bakery: `rotation` is §2's 24, version 1. `label` and `card` are the name and card text in both languages (§6).
  - `CYCLE` and `LIMITED` remain, as Pastry shop's, so current uses (the share-card script and others) keep working.
  - `forSlot(seed, index, themeId = 'default')` returns `THEMES[themeId].rotation[(index + sum) % rotation.length]`, so with no theme it returns exactly what 0.2 returns.
- **Rule checks** (`node scripts/theme-manifest.mjs --check`, which CI already runs): every drawing belongs to at least one theme; no theme repeats a key, and `rotation` and `limited` do not overlap; each mascot is in its own `rotation`; every key has English, Traditional and Simplified names; every theme has `label` and `card` in both languages, and `card` contains `{count}` and no typed number; `version` is a positive integer; the generated list files match the committed ones, and no stale list file is left over. The old check "every drawing must be in `CYCLE` or `LIMITED`" is replaced by these per-theme checks. The script itself no longer holds any theme data.
- **`scripts/make-icons.mjs`** generates every theme's icons in one run (Pastry shop's are still only the three PNGs). `package.json` gains `npm run themes`, which runs the list generator and then the icon generator.
- **Keys are never removed, per theme**: the released-key list in `tests/collections.test.mjs` becomes one list per theme: `{ default: [today's 39], bakery: [the 24, the 12 shared keys and toastbite included] }`. For every theme the test checks that the committed list file equals a fresh build; that its keys are exactly that theme's released list (a new key is registered in the same change); that every theme has a released list; and that what the server loads equals the committed file. A key in two themes is listed under both; dropping it from either fails even if the other still has it, because that theme's members hold it and `/api/me` looks up its names and cap in their own team's list only.
- **The app no longer hard-codes `laopo`** for the mascot; it always comes from the theme.

## 10. Adding a Theme of Your Own

`docs/THEMES.md` is rewritten in three parts: the two existing themes, the drawing rules (the paragraph in §2), and the steps to add a theme:

1. **Draw and list it in `assets/sprites.js`**: draw each item by the drawing rules, give each one English, Traditional and Simplified names in `NAMES`, and add an entry to `THEMES`: the mascot, the rotation order (optionally some app-only items), the name in both languages, the card text in both languages (with the count as `{count}`) and version 1.
2. **Run `npm run themes`**: it generates the list file and the icons.
3. **Register the new keys**: add an entry for the theme to the released-key list in `tests/collections.test.mjs` (shared keys included), then run `npm test`. If step 2 was skipped, or the mascot changed without a rerun, the tests fail.
4. **(Optional) Your own wording**: to give the sentences in §6 your own phrasing, add `<base key>.<theme id>` to both language files; without them, Pastry shop's are used.

## 11. Not in This Round

- A café theme (next round: the same approach, new coffee drawings and its own sentences; which mascot it uses is decided then).
- A colour scheme per theme. The café theme is planned in a dark scheme, set apart from the warm Pastry shop and Bakery; it comes next round together with per-theme colours (the coffee drawings will be drawn for a dark background). So this round, new interface code uses only the existing colour variables in `app/app.css` and `assets/style.css`, and adds no hard-coded colours.
- The two sentences at the top of the README and in the demo's link-preview text that still say "recognition".
- Bubble tea and plant themes.
- Showing Bakery in the README screenshots or the link-preview image.
- An animation for changing the theme in the app's Settings.

## 12. Testing and Acceptance

Unit tests (`node --test`):

- **Migration**: a 0.2 database is on `default` after the upgrade, with its data unchanged.
- **Unknown themes**: `openDatabase` refuses a database whose `theme` is not a shipped list (`THEME_UNKNOWN`) and opens a new database with no team as usual; `recover-owner` refuses it too; `restoreDatabase` refuses such a schema-3 backup and leaves no file behind, while schema 1 and 2 backups and backups taken before setup restore as usual.
- **Setup**: no theme means Pastry shop; `bakery` means Bakery; an unknown theme is refused; `org.setup` records the theme.
- **Changing the theme**: an owner can change it before the first treat and an admin cannot; after the first treat it returns `RULES_LOCKED`; a change removes icons the new theme lacks and keeps shared ones, with `iconsRemoved` and the audit row (`changed` including `theme`, `theme.from/to`, `iconsRemoved`) right; a change without `theme` still returns the organization, with `iconsRemoved` 0 and the audit row still just `{ changed }`.
- **Benefit icons and retries**: add a benefit with a Pastry-shop-only icon using request key K; after switching to Bakery its icon is null; resending the same body with K returns the stored answer and there is still exactly one benefit; a new add with a Pastry-shop-only icon is refused (422) and stores no idempotency row.
- **Collection**: a Bakery team unlocks from the Bakery's 24 keys, capped at 24, in hash order; a Pastry shop team is unchanged.
- **API**: `/api/me`, `/api/admin/rewards` and the session (signed in and out) carry the right theme; a benefit icon must be a key of the team's theme.
- **Icons**: a Bakery team gets the Bakery icons, a Pastry shop team the existing ones, and before setup the Pastry shop ones are served; for every theme other than Pastry shop, the four files exist, and the PNGs decode to the same pixels as drawing the current mascot (pixels compared, not bytes).
- **Theme lists**: each matches `sprites.js`; released keys are checked per theme (§9); every key has its three names; `card` has `{count}` and no digits; `forSlot` with no theme or with `default` equals 0.2's `CYCLE[(index + sum) % 33]`.
- **Wording**: both languages have the same keys and placeholders; every `<base key>.<theme id>` has its base key and the same placeholders; every Bakery sentence is used; no new interface string contains "recognition" / 认可.

Browser tests (Playwright):

- Setting up a Bakery team: the member page, header, oven intro and sign-in page are all Bakery's, and the page's tab-icon link points at the Bakery icon.
- A Bakery team signs out and the follow-up question about who is signed in gets no answer: the sign-in page still shows the Bakery mascot.
- Settings: the theme can change before the first treat; a change that removed icons shows how many, one that removed none shows "Settings saved."; with benefits and no treat, the revised `lockedByBenefits` shows and the cards are selectable; after the first treat the cards are greyed out.
- Public demo: Pastry shop's shelf and legend (33 / 6) match 0.2; after switching to Bakery the shelf, mascot, its accessible name, cabinet and numbers change, all three cards have pictures and the console has no errors; the choice survives a reload; "Reset the demo" keeps the chosen theme; the tour restarts; with `prefers-reduced-motion` there is no shutter and the switch is instant.
- The existing accessibility checks pass on the theme choice in setup and Settings too (390px and 1440px).

Acceptance:

1. **The 12 new drawings** (the 11 new items plus Bitten Toast, drawn to the §3 grid) are shown to the maintainer in two batches, with Bitten Toast in the same batch as `loaf`, each at intro and header size; they are final only once approved.
2. Unit tests, browser tests and the process drill run from a fresh clone, recorded in `docs/VALIDATION.md`, with anything not run marked "not verified".
3. Screenshots of the Bakery member page, Settings page and demo, and the shutter animation, are shown to the maintainer.
4. Version 0.3.0. Pushing, opening a pull request and merging all wait for the maintainer.

## 13. Documentation

- **`docs/THEMES.md`**: rewritten as in §10; "Keys are forever" becomes per theme; the old line saying a benefit "stays and is shown with no icon" goes (a theme change removes such icons, §4); the list of things generated from `sprites.js` gains the home-screen icons.
- **`README.md`, `README.zh-CN.md`**:
  - The version contents gain "collection themes", and the upgrade note links to OPERATIONS.md "Upgrading from 0.2 to 0.3" (keeping the 0.1-to-0.2 link).
  - "Make it yours" gains themes; "Want different pastries? That's one file" is replaced by a pointer to adding a theme with `docs/THEMES.md`.
  - Under "Status and limits", "one collection theme (the pastries)" becomes two themes to choose from, one per team.
  - Every "39" gives each theme's own count (39 and 24).
  - These new sentences go to the maintainer for approval with the rest of the documentation changes.
  - The screenshots are retaken with `scripts/screenshots.mjs` once the version is 0.3.0 (still Pastry shop), so their footer reads "Crumb 0.3.0"; the "0.3.0" row in `RELEASE-CHECKLIST.md` checks that footer by eye, as for 0.2.0.
- **`docs/OPERATIONS.md`**:
  - The opening list of upgrades gains 0.2 to 0.3.
  - A new "Upgrading from 0.2 to 0.3" section, modelled on the 0.1 to 0.2 one: schema 2 becomes schema 3, and a backup after the upgrade prints `schema 3`; migration 003 adds `organization.theme`, and existing teams are on Pastry shop; once it has run, 0.2 refuses the database, so going back means restoring the backup made before the upgrade (pointing to Rolling back).
  - 0.1 can upgrade straight to 0.3: migrations 002 and 003 run in one transaction, and a failure message then names schema 3.
  - "Unknown theme": the `THEME_UNKNOWN` message and its remedy quoted exactly; Restoring and Rolling back gain a line saying that a database or backup using a theme this version lacks is refused, like a newer schema.
  - Changing the theme before it is fixed; a home-screen icon must be added again to change; an upgraded team that has already sent a treat sees the theme cards greyed out, on Pastry shop.
  - "Putting a mistaken entry right" and "Treats to several people" say "collectibles" instead of "pastries".
- **`docs/DEPLOYMENT.md`**: "Before you start" gains "pick a collection theme; it is fixed after the first treat"; the setup step's list of choices names the theme; "After setup" says a benefit's icon is "one of your theme's collectibles" and lists the collection theme in Settings (changeable until the first treat); "Upgrading" gains 0.2 to 0.3 and links the new operations section; the security notes say "collectible count" instead of "pastry count".
- **`scripts/restore.mjs`**'s header comment: it refuses a backup that uses a theme this version does not include.
- **`CONTRIBUTING.md`**: run `npm run themes` after changing a mascot or adding a theme.
- **`docs/VALIDATION.md`, `docs/RELEASE-CHECKLIST.md`**: updated for this round.

## 14. Assumptions (implemented as approved)

1. Theme ids: Pastry shop keeps `default` (the released keys and list file already use it); Bakery is `bakery`.
2. The `npm run demo` sample team stays Pastry shop; `--theme bakery` starts a Bakery sample team, for trying it out and for screenshots.
3. Pastry shop's list file gains a `mascot` field; its keys do not change, so its version stays 1. Bakery's version starts at 1.
4. New drawings follow §2's drawing rules; no separate palette is defined.
