# Crumb: Café Theme (Candlelight Colours)

*Translated from the Chinese original, [2026-10-06-crumb-cafe-theme-design.zh-CN.md](2026-10-06-crumb-cafe-theme-design.zh-CN.md).*

Status: design draft, awaiting the maintainer's review (2026-10-06).
Baseline: 0.3.0 (`main`, merge commit `5247e73`). The design of 0.3's collection themes is [2026-10-03-crumb-themes-design.md](2026-10-03-crumb-themes-design.md); this document follows its approach and wording, and calls it "the 0.3 design" below.

## 1. Goals and Decisions

A third collection theme, Café. It is the first theme with its own colour scheme: a café after dark with its lamps lit (candlelight). Pastry shop and Bakery do not change by a single pixel or a single word.

Decisions (carried over by this document unchanged):

- **A third theme**: id `cafe`, named "Café" in English and "咖啡店" in Simplified Chinese. Pastry shop (`default`) and Bakery (`bakery`) stay exactly as in 0.3.
- **Only Café has its own colour scheme, and it is always dark**: it does not follow the phone's or computer's dark mode. Pastry shop and Bakery get no dark mode this round.
- **The look is the chosen mock-up**: a render and its CSS (a skin for a fixed mock-up, not the app's styles), kept by the maintainer outside the repository; gate 3 compares the screenshots against it. Every value in the mock-up (shadows included) is copied into the table in §4.6; the implementation follows the table, and wherever the table departs from the mock-up the table says so. Directions not taken: plain flat dark, metallic finishes (brushed brass, chrome, copper, gold foil), velvet and plum, satin champagne, latte foam, matte ceramic.
- **What is dark**: every page a café team sees — the member page, Team page, Settings page, sign-in page, dialogs and bottom sheets, the spend keypad, toasts, notices, badges, form errors. **The setup page stays light, as it is today** (no theme exists yet at that point). The theme cards (setup and Settings) each show their own theme's colours: the café card is dark, and the Pastry shop and Bakery cards stay light even inside the dark Settings page.
- **Changing the theme in Settings**: 0.3's lock rule is unchanged (an owner can change it until the first treat). After saving, the whole page changes colour at once; changing back does the same.
- **Icons and opening animation**: the browser tab icon, the home-screen icon and the opening animation all show the café mascot on a dark background.
- **No light flash**: a café team's page does not flash light first when it opens. The device remembers the last theme, so the first paint is already dark. (Exceptions: a new device opening it for the first time, see assumption 16; a device that remembers a light theme while the team has switched to Café on another device, see §5.)
- **24 items**: 16 coffees (new drawings) + 8 desserts (existing, already approved drawings). The mascot is one of them, Hot Coffee.
- **The steam is pixels in the mascot drawing**, and the animation is those pixels appearing and disappearing by a rule (§3). Tapping the header mascot makes it steam, with no crumbs; Pastry shop and Bakery still spill crumbs.
- **Wording**: 8 places in the app and 11 in the demo, using the approved sentences exactly (§7, §8).
- **Public demo**: the switch becomes three buttons, "Pastry shop | Bakery | Café"; the shutter works as before, and the whole demo page changes colour while it is down (the part outside the phone has no shutter in front of it, see assumption 8) (§8).
- **Acceptance**: three gates, each needing the maintainer's yes (§13). Pushing, opening a PR and merging all wait for the maintainer's word.

## 2. What the Café Holds

**24 items**:

- **8 desserts reused** (same key, same drawing, not one pixel changed): Tiramisu `tiramisu`, Madeleine `madeleine`, Croissant `croissant`, Cinnamon Roll `cinnamonroll`, Portuguese Egg Tart `porttart`, Swiss Roll `swissroll`, Black Forest Cake `blackforest`, Strawberry Cake `strawberrycake`. Of these, `porttart` was only in Pastry shop until now, `swissroll` and `blackforest` are in all three themes, and the other 5 were only in Bakery.
- **16 new coffee drawings** (the first is the mascot: 15 new coffees plus the mascot). Each has one feature no other item has, so it is still recognisable at 12×12. The keys are proposed by this document (assumption 1) and have been checked: none collides with the existing 51 keys or with any theme id. The names are provisional and are settled at the drawing gate (see below).

| Key | Simplified (provisional) | Traditional (provisional) | English (provisional) | Drawing notes (decided) |
| --- | --- | --- | --- | --- |
| `hotcoffee` | 热咖啡 | 熱咖啡 | Hot Coffee | **the mascot**: a side-view white cup on a saucer, coffee visible at the rim, handle on the right, steam above; no face |
| `espresso` | 意式浓缩 | 意式濃縮 | Espresso | a very small cup, dark crema on top |
| `latte` | 拿铁 | 拿鐵 | Latte | seen from above, a milk-foam heart |
| `cappuccino` | 卡布奇诺 | 卡布奇諾 | Cappuccino | foam heaped above the rim, dusted with cocoa |
| `mocha` | 摩卡 | 摩卡 | Mocha | a tall cup, whipped cream and chocolate sauce on top |
| `macchiato` | 焦糖玛奇朵 | 焦糖瑪奇朵 | Caramel Macchiato | a clear glass, layered, caramel crosshatch on top |
| `icedcoffee` | 冰咖啡 | 冰咖啡 | Iced Coffee | a tall glass, ice cubes visible, a straw |
| `coldbrew` | 冷萃 | 冷萃 | Cold Brew | a glass bottle |
| `affogato` | 阿芙佳朵 | 阿芙佳朵 | Affogato | a scoop of ice cream with espresso poured over |
| `irishcoffee` | 爱尔兰咖啡 | 愛爾蘭咖啡 | Irish Coffee | a stemmed glass, dark below, white cream on top |
| `vietnamesedrip` | 越南滴漏 | 越南滴漏 | Vietnamese Drip | a metal phin filter sitting on a cup |
| `pourover` | 手冲 | 手沖 | Pour-over | a dripper on a glass server |
| `takeaway` | 外带咖啡 | 外帶咖啡 | Takeaway Coffee | a paper cup with lid and sleeve |
| `espressotonic` | 咖啡汤力 | 咖啡湯力 | Espresso Tonic | a tall layered glass, an orange slice on the rim |
| `dalgona` | 400 次咖啡 | 400 次咖啡 | Dalgona | fluffy whipped coffee on white milk |
| `frappe` | 咖啡冰沙 | 咖啡冰沙 | Coffee Frappé | a dome-lid cup with a straw |

Yuenyeung (鸳鸯) is not chosen: drawn, it is just a light-brown drink, impossible to tell from milk tea or the mascot.

**Names are settled at the drawing gate**: every new drawing goes through 0.3's blind-naming loop: several independent namers see only the shrunken drawing (the mascot a second time on the dark page colour), are not told the name and are given no grid, and each says what it is; their answers go into the gate 1 material. How many namers, and what counts as recognised, see assumption 32. A drawing that is not recognised is fixed first; if it is still not recognised after fixing, it is discussed with the maintainer before deciding whether to replace it. A replacement changes the key and all three names together, and every place in this document where the key or a name appears changes with it (§2, §3, §8, §10, §13, §15 and so on); if `latte` is the one replaced, the demo's line "“Latte is coming right up”" also takes the new item's English name, which makes it a new sentence needing its own approval (at which gate, see assumption 33). English names capitalise each word, following the existing names (assumption 2a).

**The rotation order** (also the demo's rotation; all 24 café items are in the demo's rotation, with no app-only items and an empty `limited`, as for Bakery — assumption 3c):

`hotcoffee`, `latte`, `tiramisu`, `icedcoffee`, `cappuccino`, `croissant`, `mocha`, `pourover`, `madeleine`, `takeaway`, `dalgona`, `cinnamonroll`, `espresso`, `coldbrew`, `porttart`, `irishcoffee`, `frappe`, `swissroll`, `vietnamesedrip`, `macchiato`, `blackforest`, `espressotonic`, `affogato`, `strawberrycake`.

How it is ordered (assumption 3a): the mascot first (0.3's rule: a card draws the first three items of the list, and the first is the mascot); after that, every three items are two coffees and one dessert, so the card's three pictures are Hot Coffee, Latte, Tiramisu, matching the card text "coffees and sweets". Items that look alike are kept apart, in these groups: the two small cups (`hotcoffee`, `espresso`); the clear glasses where layers or ice show (`icedcoffee`, `dalgona`, `irishcoffee`, `macchiato`, `espressotonic`); the two with straws (`icedcoffee`, `frappe`). No two items of the same group are adjacent in the order (the last item wrapping round to the first counts too). In the self-hosted app, each person's shelf still has its own order by `SHA-256(userId:key)` (`orderedKeys` in `server/collections.mjs`), which this order does not affect. What this order decides: the demo's rotation, the card's three pictures, the order of the items when picking a benefit icon on the Team page (`/api/admin/rewards` gives the keys in list-file order, and the list file is the rotation followed by `limited`), and the order of the demo's cabinet.

**How they are drawn**: by the format and drawing rules in `docs/THEMES.md` — 12×12, `.` transparent, `#RRGGBB` palette, flat fills, 3 to 5 colours including the outline, no faces, the outline `X` a dark shade of the item's main hue (dark brown for coffee; for a clear glass, a darker shade of the drink inside). Ceramic cups (the white cups) take the mascot draft's dark brown outline: this goes beyond `docs/THEMES.md` (where white or light items use a darker shade of that light colour) and counts as a design choice; each item's outline colour is confirmed at gate 1. **Café drawings always sit on a cream "porcelain" ground** (table below), so their outlines stay dark as usual and no separate set is drawn for the dark page. This also replaces the 0.3 design's line in §11 that "the coffee drawings will be drawn for a dark background": the chosen look puts them on porcelain, and the way they are drawn does not change.

| Where the drawing sits | Ground | Where the ground comes from |
| --- | --- | --- |
| Filled slots on the shelf (member page, inside the demo's phone, the cabinet) | porcelain slot face with a ring in the caramel ring colour (`#b98c58`) | the mock-up's `.sl li` |
| Empty slots on the shelf (only `.slots > .slot:not(.filled)`, §4.6) | a dark hole with a brown ring (no drawing inside) | the mock-up's `.sl li.empty` |
| The header mascot (when no logo is uploaded; member page and inside the demo's phone) | a small porcelain medallion (round, assumption 7) | the mock-up's `.hd canvas` |
| The brand mascot on the sign-in page and on the invitation and sign-in link pages | a small porcelain medallion | **design choice**: the mock-up has only the header; the header's medallion is reused |
| The "next item" line (the small picture before "{name} is coming right up") | a small porcelain medallion, one size smaller | **design choice**: the mock-up draws no picture on this line; the header's medallion is reused |
| Benefit icons (member page, Team page lists) | a small porcelain medallion | **design choice**: the header's medallion is reused |
| Picking a benefit icon on the Team page (`.icon-picker .slot`, including the "—" slot) | porcelain slot face, never drawn as an empty-slot hole | **design choice**: the collection slot's look is reused |
| The three pictures on a theme card (canvases in `.theme-card-pics`, not `.slot`, so they need their own rule) | porcelain slot face | **design choice**: the card carries its own theme's colours (§6) |
| Demo: the person buttons, the three cards | a small porcelain medallion | **design choice**: the header's medallion is reused |
| **Exceptions**: the opening animation, the browser tab icon, the home-screen icon | drawn straight on the dark page colour | decided (§1); how the saucer shows on dark, see §3 and assumption 6 |

The rows marked "design choice" are shown to the maintainer on the gate 3 screenshots, and the maintainer decides whether these places use porcelain (a medallion or a slot face) or draw straight on dark (§13).

Pastry shop and Bakery do not change; the rows are of two kinds:

- **The slot rows** (filled and empty collection slots, the icon-picker slots on the Team page, the slots inside the demo's phone and in the cabinet): they already have a ground today — `--slot-bg`, `--slot-border` and the inset shadow (the app's in `app/app.css`, the demo's in `assets/style.css`) — and Pastry shop and Bakery keep their values; in the light set, the empty-slot variables simply equal the filled-slot values. The three pictures on a theme card have no ground today; in the light set their variables are `none` and `0`.
- **The medallion rows** (header mascot, sign-in mascot, the "next item" picture, benefit icons, and in the demo the person buttons, the cards and the header): Pastry shop and Bakery have no ground there.

In the light set, each of these new variables holds the value that property has in Pastry shop today, and is never left empty: for example, the header mascot button's corner radius is `8px` (it also sets the focus ring's shape), the header logo's ground is `var(--tile)`, and elsewhere it is `none` or `0` (§4.6). So Pastry shop and Bakery are as in 0.3.

## 3. The Mascot and Its Steam

**The mascot**: Hot Coffee, `hotcoffee`: a side-view white cup on a saucer, coffee showing at the rim, handle on the right, two wisps of steam above, no face (the same rule as Bakery's Bitten Toast: simple, no face). Below is the draft; it settles the shape only, and the final drawing goes through the drawing loop and gate 1:

```
...s...s....
....s...s...
...s...s....
............
.XXXXXXXXX..
.XcccccccXXX
.XwwwwwwwX.X
.XwwwwwwwX.X
.XwwwwwwwXX.
..XwwwwwX...
XXXXXXXXXXX.
............
```

(`X` dark brown outline, `c` coffee, `w` white cup, `s` steam — a warm grey-brown that must read both on the porcelain medallion and on the dark page.)

**The final steam** (decided): each wisp is 4 rows. A wisp's "offset" in a row is how many columns that row's steam pixel sits to the right of the wisp's leftmost pixel (rightward positive); from top to bottom it is `[0,1,1,0]`, a ")" bulging to the right:

```
s.
.s
.s
s.
```

At the two wisps' positions in the draft (leftmost pixels in columns 3 and 7), the 4 rows of the steam area are (the exact columns are settled while drawing):

```
...s...s....
....s...s...
....s...s...
...s...s....
```

The steam printed in the draft has only 3 rows; the 4-row `[0,1,1,0]` governs. This is the version the maintainer chose in the side-by-side comparison of steam animations (the other version there was `[1,0,0,1]`, a "(" bulging to the left, not chosen). The steam takes rows 0 to 3, right against the rim; the cup and saucer stay where the draft puts them. Every animation mock-up the maintainer saw was laid out this way.
The drawing gate looks at it on both grounds: the porcelain medallion (header, shelf) and straight on dark (opening animation, icons). The draft's saucer is a whole row of outline colour, nearly invisible on dark; the cup body is white and carries the shape. How the saucer also shows on dark is solved while drawing (assumption 6).

**How the steam is marked in the drawing** (assumption 4): a drawing gains a field `steam` naming the palette character used for steam, e.g. `steam: 's'`. Pixels drawn with that character are steam. Steam pixels that touch (by an edge or a corner) form one wisp, counted from left to right. The rule checks (`node scripts/theme-manifest.mjs --check`) also check: `steam` is a character in that drawing's palette; the steam fills exactly 4 consecutive rows; each wisp has at least one pixel in each of those 4 rows; there are exactly 2 wisps; a drawing marked `steam` must be some theme's mascot (assumption 31). The exact curve is not part of this general check (which covers any theme's mascot marked with steam); the ")" shape of `hotcoffee` is pinned by a unit test (§13, one of the gate 1 checks). Only the mascot is marked with steam (assumption 28); another coffee with pixels in a steam colour just has them as part of the drawing, and they do not move. If the same drawing is an ordinary item (not the mascot) in another theme, its steam there shows in full and does not move.

**The animation rule (decided)**: the steam is these pixels in the drawing, with no extra particles. A wisp appears row by row from its bottom row upward, then disappears row by row from the bottom upward (rising, then dissipating), never moving left or right and never mirroring. A cycle is 8 steps of 120 ms; the two wisps are half a cycle apart. With the steam area's rows numbered 0 to 3 from the top, the rows shown at each step are:

| Step | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rows shown | 3 | 2, 3 | 1, 2, 3 | 0 to 3 | 0, 1, 2 | 0, 1 | 0 | none |

Which wisp goes first is not in the decisions; see assumption 30.

- **Drawing**: `Pixel.drawSprite` in `assets/sprites.js` gains an optional step number: given one, it hides the steam pixels the table above hides; without one, it draws the whole drawing (as now). Centring is still measured on the whole drawing (`Pixel.offset`), so the cup does not jump up and down as the steam changes pixel by pixel. The table and the 120 ms step are written only in `sprites.js`, shared by the app and the demo.
- **At rest** (header, shelf, cards, the "next item" line, icons): the steam shows in full and does not move.
- **Opening animation**: dark background, and the cup pops in as today's mascot does; while the opening animation is showing, the steam keeps cycling through the table. The opening animation starts leaving at 0.9 s as in 0.3 (`ovenIntro` in `app/motion.js`), takes the cup with it, and the animation stops.
- **Tapping the header mascot**: the same little shake as before (`.crack`), while the steam runs one cycle (8 steps, about 1 second) and then returns to the whole drawing at rest (assumption 5). Tapping again before the cycle ends starts it over. No crumbs — a cup spilling crumbs makes no sense. The code decides not by theme id but by whether the mascot's drawing is marked `steam`: one with steam steams, one without spills crumbs in its outline colour as before (`crackMascot`). So Pastry shop's and Bakery's crumbs do not change at all.
- **Reduced motion** (`prefers-reduced-motion`): nothing moves — no shake, no steam cycle, and the opening animation is skipped as in 0.3; the cup and its steam stand still, shown in full.

## 4. Colours (Candlelight)

### 4.1 How Colours Reach the Page

- **One attribute**: `<html>` gains `data-theme="<theme id>"`. It is computed in one function only: a new `applyTheme(themeId)` in `app/main.js`, which wraps 0.3's `applyThemeIcons`. Every session `main.js` accepts goes through `adoptSession` (on load, after sign-in and setup, on the refresh after saving Settings, on sign-out; see the comment at `app/main.js` lines 55–57), and it is called there. But two pages read the team's theme themselves without going through `adoptSession`: the Settings page requests `/api/session` itself (`app/views/settings.js` line 209), and the member page, when the `org` in `/api/me` changes, only redraws without reloading the session (`app/views/member.js` lines 147–149). So: `renderSettings` calls `ctx.applyTheme(session.org.theme)` once it has the answer, and the member page calls `ctx.applyTheme(me.theme.id)` on every draw. This is what the hook on ctx is for, and it avoids the epoch and CSRF side effects of accepting the session again through `ctx.renewSession()`. The header mascot is drawn from `state.session` and catches up at the next full redraw. Other pages already open that read neither of these (for example the Team page in another tab) change colour only on their next load (assumption 38).
- **`applyTheme` does four things at once**: sets or removes `data-theme`; records it on the device (§5); points the tab and home-screen icon links (as in 0.3); sets or removes the browser bar colour (§4.5). Saving Settings used to call `ctx.applyThemeIcons(saved.theme)`; it now calls `ctx.applyTheme(saved.theme)`, so the colours have already changed even if the refresh that follows fails. The first two follow this table:

| The team's theme in the session | `<html data-theme>` | `crumb.theme` on the device |
| --- | --- | --- |
| No team (not set up yet) | removed | deleted |
| A team, but its `theme` is missing, not a string, or not well-formed | removed (light) | deleted |
| A well-formed id (`default`, `bakery`, `cafe`, or one this page does not know, such as `constructor`) | set to that id as is | that id, written as is |

  "Well-formed" uses the same rule as `app/early-theme.js` (2 to 32 lowercase letters and digits, starting with a letter, §5) and does not look at the sprite table: the colours are in the stylesheet and should not fall back to light just because `assets/sprites.js` did not load (`knownTheme` in `app/pixels.js` treats everything as Pastry shop when there is no sprite table, lines 13 and 62–64). An id with no colour set in the stylesheet is light. The icons are still chosen by `knownTheme`, as in 0.3. Reads and writes of device storage are wrapped in try/catch, as in `app/i18n.js` and `app/motion.js`: when storage is disabled nothing is recorded and the page is still right (every load goes through `adoptSession`, and a throw there would stop the whole page from starting).
- **One set of variables**: in `app/app.css`, the light set of variables is written on "the page's root element and any element with `data-theme`" (`:root, [data-theme]`), with today's values; after it comes a `[data-theme="cafe"]` set with the café values, plus `color-scheme: dark`, so that the controls the browser draws itself — dropdowns, the file-upload button, scrollbars, radio buttons and checkboxes — turn dark too. The light set is written on "any element with `data-theme`" for the theme cards' sake: each card also carries its own `data-theme` (§6), so a Pastry shop card inside a café page gets the light variables back, and a café card inside the light setup page gets the café ones. A card states its own text colour (`.theme-card { color: var(--ink) }`) and ground (`.radio` is already `var(--tile)`) instead of inheriting them from the page.
- **Variables only**: every colour in the stylesheet comes from a variable (the mapping in §4.6). Where one variable serves several uses today and Café needs different colours for them (for example `--wood` is at once the link colour, the primary button's ground and the selected card's border), it is split by use into several variables; each new variable holds, in the light set, the value of the place it came from, so the computed styles are identical. After the split, `--wood`, `--wood-deep`, `--gold` and `--gold-deep` have no use left and are removed from `app/app.css`. What is a gradient in the mock-up (the lamp glow at the top of the page, the tiles, the balance tile's lamp, porcelain, the honey button, the log bar) is stored in variables used only as backgrounds; variables used as text colours, or read by scripts, hold only plain colours. **`--bg` is always one plain colour**: the demo's tab icon writes it into an SVG `fill`, `THEMES.cafe.background` must equal it, the browser bar uses it, and the opening animation and the demo's phone screen use it as their ground. The lamp glow at the top of the page is a separate variable, `--page-art` (§4.6).

### 4.2 Colours Hard-coded Today

Checked line by line in `app/app.css` (line numbers are 0.3.0's). These all become variables, and Pastry shop's and Bakery's values are the original hard-coded ones (which variable each becomes, see the mapping in §4.6):

- the fine grid in the page background (lines 33–34);
- light text on wood, `#fff8e6` (lines 56, 81, 103) and `#fff3dc` (lines 153, 171, 186, 354);
- the slot's inset shadow (line 145); the secondary button's ledge `#d3bc92` (lines 167, 169);
- the three badge sets (lines 255–257), form errors (line 279), notices and the home-screen tip (lines 280–281);
- the ground of the selected card and the link panel, `#fff8e6` (lines 289, 315);
- the grey text for a zero amount, `#d9c4a6` (line 340); the keypad's three colours (lines 346–347); the confirm key's ledge `#9c6e14` (lines 350–351);
- the toast's shadow and the error toast's border `#93342a` (lines 354–355).

**Deliberately not made variables**:

- The QR code's white ground `#fff` (line 318). A QR code needs a white ground to scan; in Café it is a white plaque on a dark panel.
- The scrim behind dialogs (line 327). `.dialog::backdrop { background: rgba(58, 36, 17, 0.45) }` stays as is, and a rule `[data-theme="cafe"] .dialog::backdrop { background: rgba(0, 0, 0, 0.6) }` is added. Why: in older browsers `::backdrop` does not inherit variables from the dialog (it does from Chrome 122, Firefox 120 and Safari 17.4), and this app also runs on older browsers (it only needs `:has()`, lines 289–290: Chrome 105, Safari 15.4 onward). In those browsers `var(--scrim)` would not compute, and every theme's dialogs would lose their scrim, Pastry shop's included. A fallback, `var(--scrim, rgba(58, 36, 17, 0.45))`, is not enough either: Pastry shop is kept right, but Café gets the brown scrim in older browsers. Selecting by the dialog's ancestor is right in every browser that supports `::backdrop`. Browser tests run only on Chromium (`docs/VALIDATION.md`) and cannot see this, so it is written down here.

### 4.3 Colours on Canvases

Two canvas colours are hard-coded in scripts: the balance digits, `'#4a2f1b'` (`app/views/member.js` line 48), and the pixel wordmark "CRUMB" on the sign-in and setup pages, `'#4a2f1b'` (`app/views/auth.js` line 28). They become reads from variables at draw time: `--digit` and `--wordmark` (`app/pixels.js` gains a small function that reads a style variable with `getComputedStyle`). The function always reads from `document.documentElement`, never from the canvas: the sign-in wordmark is drawn inside `frame()` before it is put into the page (`app/views/auth.js` lines 23–28), and a node not yet in the page reads as an empty string, which would draw in the default black. It reads once per draw; the rolling balance digits read once when each roll starts, not every frame (the callback at `app/views/member.js` line 48 draws every frame). Pastry shop and Bakery have both variables at `#4a2f1b`, so they draw exactly as in 0.3. For forced colours (`forced-colors: active`), see assumption 39. The crumbs still take the mascot's outline colour, and the fallback `#5C3A1D` (`app/pixels.js` line 19) does not change.

### 4.4 Content Security Policy (CSP)

The server's policy is `script-src 'self'` and `style-src 'self'` (`server/app.mjs` lines 19–31), and it does not change:

- The theme's styles are all in `app/app.css`; the page writes no `style` attributes. Scripts only set `data-theme`, an ordinary attribute, and read computed colours — neither is restricted by this policy (existing code already sets animation delays through `node.style` in this way; see the comment at `app/views/member.js` lines 59–60).
- The small script that prevents the light flash (§5) is a separate file in `app/`, not an inline script in the page, so `script-src 'self'` allows it.

### 4.5 Browser Bar, Web Manifest, Icons

- **Browser bar colour** (assumption 18): today's `app/index.html` has no `<meta name="theme-color">`. One is added only for themes with their own colour scheme (those with a `background` in `THEMES`): for Café, `applyTheme` puts one in, set to the café page colour, so the address bar on Android is dark too; for Pastry shop and Bakery none is added, as today. When the tag is removed, the browser bar goes back to the browser's own default. For the browser bar's colour when the page has just opened and the session has not arrived yet, see assumption 40 and §5.
- **Web manifest** (`app/manifest.webmanifest`, assumption 19): unchanged. Its `theme_color` and `background_color` are only used when it is "opened like a standalone app", and Crumb's manifest is `"display": "browser"` (it opens in the browser), so these two colours are never seen.
- **Icons**: `scripts/make-icons.mjs` today draws every theme on the same `BACKGROUND = '#F2E7CE'` (line 22). This changes to: a theme with a `background` in `THEMES` uses it, and one without uses `#F2E7CE` (field name in assumption 26, function signatures in §10). Café has `background: '#160F0A'` (the same as `--bg`; a test checks that the two are equal). So Pastry shop's and Bakery's icons do not change by one pixel; Café's `app/icons/cafe/favicon.svg` and `icon-180/192/512.png` are Hot Coffee on a dark ground, with its steam shown in full. The server's route that serves icons by the team's theme (`server/app.mjs` lines 124–132) already finds the folder by theme id and needs no change.

### 4.6 The Café Colour Table

The mock-up's CSS settles the page, the tiles, the balance tile, the name on the balance tile, porcelain, the empty slot, the primary button, the log, plus and minus, dates and the balance digits; the table below copies in every one of its values (shadows included). **This table is what the implementation follows**. What the mock-up lacks (badges, notices, form errors, keypad, dialogs, toasts, focus ring, links, quiet buttons, prices, inputs, the sign-in page, the logo's ground), and the mock-up's colours used in places the mock-up does not draw, are filled in from the same palette, marked "design choice" and **shown to the maintainer on the gate 3 screenshots** (§13). Contrast is computed by WCAG: text at least 4.5:1; focus ring and input borders at least 3:1 (assumption 24). For a gradient ground, every stop of the gradient is checked; the table gives the lowest result across every ground the code actually puts the colour on, with that ground in brackets.

Names used: "caramel" means `#ecbc7c` (`--accent`; the unit line on the balance tile is the similar `#ebbd84`), and "caramel ring colour" means `#b98c58` (`--frame`, `--slot-border`). §2 and §6 use these names.

**(a) Where today's variables and hard-coded colours go** (`app/app.css`, 0.3.0 line numbers; the demo's are in §8)

| Today | Becomes |
| --- | --- |
| `--bg`: page 31, opening animation 364 | kept (plain colour) |
| fine grid (hard-coded, 33–34) | `--page-art` |
| `--tile`: tiles 119, log 183, menu 98, dialog 325, sign-in card 376, option cards 288, name button 88, intro text box 368 | kept |
| `--tile`: header logo 76 | `--brand-logo-bg` |
| `--tile`: inputs 270, language select 107 | `--field-bg` |
| `--paper`: hover 80, 102, 241, secondary button 166, default badge 254, disabled input 276 | kept |
| `--paper`: logo preview 319 | `--logo-preview-bg` |
| `--ink` | kept; the name on the balance tile (`.holder`, which inherits `--ink` today) gets its own `--holder-ink` |
| `--ink-soft` | kept; the unit on the balance tile 134 → `--tile-label`, the "next item" line 157 → `--card-soft` |
| `--wood` (16 uses) | removed. Links 46, team name 70, small headings 122, quiet buttons 174, group headings 285 → `--accent`; current-page pill 81, 103 → `--pill-bg`; slot name bubble 153 → `--bubble-bg`; primary button 171 → `--primary-bg`; log header bar 186 → `--bar-bg`; selected card border 289, sheet top border 333, intro text box border 368 → `--frame`; radios and checkboxes 291, 303 → `--control-accent`; toast 354 → `--toast-bg` |
| `--wood-deep` (8 uses) | removed. "Skip to content" 56 → `--skip-bg`; primary button ledge 171, 172 → `--primary-shadow`, `--primary-shadow-active`; prices 250 → `--price`; confirm key text 350 → `--confirm-ink`; toast border and ledge 354 → `--toast-border`, `--toast-shadow`; intro text box ledge 368 → `--intro-ledge` |
| `--gold` | removed. The small diamond before the log title 189 → `--bar-dot`; confirm key 350 → `--confirm-bg` |
| `--gold-deep` | removed. The link panel's dashed border 315 → `--link-panel-border` |
| `--plus`, `--minus` | kept; the error toast's ground 355 (`--minus` today) → `--toast-error-bg` |
| `--line` | kept; the lines between list rows 196, 200, 231, 305 → `--row-line` plus `--rule-style` |
| `--slot-bg`, `--slot-border` | kept (filled slots, icon-picker slots); empty slots get their own `--slot-empty-*` |
| `--focus`: focus ring 47, the icon picker's selected frame 313–314 | kept |
| `--lift`: tile shadows 98, 119, 183, 325, 376 | kept, with its own café value; the balance tile gets its own `--lamp-shadow` |
| `#fff8e6`: 56, 81, 103 | `--skip-ink`, `--pill-ink` |
| `#fff8e6`: 289, 315 | `--chosen` |
| `#fff3dc`: 153, 171, 186, 354 | `--bubble-ink`, `--primary-ink`, `--bar-ink`, `--toast-ink` (the error toast inherits it today → `--toast-error-ink`) |
| slot inset shadow 145 | `--slot-shadow` |
| `#d3bc92`: 167, 169 | `--btn-ledge` |
| badges 255–257, form errors 279, notices and the tip 280–281 | `--warn-*`, `--ok-*`, `--bad-*` |
| `#d9c4a6`: 340 | `--amount-zero` |
| keypad 346–347 | `--key-bg`, `--key-border`, `--key-ledge` |
| `#9c6e14`: 350–351 | `--confirm-shadow`, `--confirm-shadow-active` |
| toast shadow 354, error border and shadow 355 | `--toast-shadow`, `--toast-error-border`, `--toast-error-shadow` |
| scrim 327 | not a variable: two selectors (§4.2) |
| QR code white ground 318 | unchanged |
| `color-scheme: light` | `dark` in the café set |

**(b) Each variable's value** (the "Pastry shop / Bakery" column is today's value)

| Variable | Used for | Pastry shop / Bakery | Café | Source | Contrast (target → lowest computed) |
| --- | --- | --- | --- | --- | --- |
| `--bg` | page ground, opening animation ground; also the colour of the icons and the browser bar | `#f2e7ce` | `#160f0a` (plain) | mock-up (the middle stop of the page gradient) | ground |
| `--page-art` | `background-image` of `body` | today's two-layer fine grid, lines 33–34 | `radial-gradient(120% 600px at 50% 0%, #251910 0%, #160f0a 55%, #0f0a07 100%)`; no grid | mock-up (colours, shape, no grid); the ellipse height changes from the mock-up's 60% to a fixed 600px measured from the top of the page, so a long Team page does not stretch the glow, and beyond the ellipse is the last stop — design choice | ground |
| `--tile` | tiles, log, menu, dialogs, sign-in card, option cards, name button, intro text box | `#fffdf6` | `linear-gradient(180deg, #221912 0%, #1b140f 100%)` | mock-up `.tl` | ground |
| `--lift` | tile shadow | today's value | `inset 0 0 0 1px rgba(255,214,160,.10), inset 0 1px 0 rgba(255,228,186,.05), 0 6px 16px rgba(0,0,0,.4)` (the mock-up's 1px hairline border drawn as the first inset shadow, taking no space) | mock-up `.tl` | — |
| `--lamp-bg` | balance tile `.main-tile` | `var(--tile)` | `radial-gradient(72% 52% at 50% 44%, #4b3019 0%, #36251a 48%, #211812 100%)` | mock-up `.card` | ground |
| `--lamp-shadow` | balance tile shadow | `var(--lift)` | `inset 0 1px 0 rgba(255,228,186,.08), 0 0 28px rgba(255,150,60,.10), 0 8px 18px rgba(0,0,0,.4)` | mock-up `.card` | — |
| `--ink` | body text | `#4a2f1b` | `#f4e7d0` | mock-up | ≥4.5 → 9.90 (lamp centre) |
| `--holder-ink` | the name on the balance tile, `.holder` | `var(--ink)` | `#f6ead6` | mock-up `.who` (the name on the mock-up's balance tile; not the app header's `.who`) | ≥4.5 → 10.17 (lamp centre) |
| `--ink-soft` | secondary text (dates, explanations, hints) | `#7a5c40` | `#b9a68b` | mock-up `.date` | ≥4.5 → 6.49 (chosen ground) |
| `--card-soft` | the "next item" line on the balance tile | `var(--ink-soft)` | `#cdb898` | mock-up `.brew` | ≥4.5 → 6.28 (lamp centre) |
| `--tile-label` | the unit on the balance tile (the name the team gives it; the "CAFÉ CREDIT" line in the mock-up) | `var(--ink-soft)` | `#ebbd84` | mock-up `.cap` | ≥4.5 → 7.00 (lamp centre) |
| `--accent` | team name, small headings, group headings, links, quiet buttons | `#7a4a26` | `#ecbc7c` (caramel) | mock-up (small headings, team name, log title); design choice (links, quiet buttons) | ≥4.5 → 7.93 (notice ground of the home-screen tip) |
| `--price` | prices | `#5c3a1d` | `#ecbc7c` | design choice | ≥4.5 → 9.91 (tile) |
| `--digit` | balance digits (canvas) | `#4a2f1b` | `#f9e0b4` | mock-up | ≥4.5 → 9.42 (lamp centre) |
| `--wordmark` | pixel wordmark "CRUMB" (canvas) | `#4a2f1b` | `#ecbc7c` | design choice | ≥4.5 → 9.91 (tile) |
| `--plus` / `--minus` | plus / minus, the small diamonds in the log, the "All {total} on the shelf" line, error text and borders | `#2f7a4a` / `#b83f33` | `#9fd8a8` / `#f4a58e` | mock-up | ≥4.5 → 7.41 (lamp centre, the "All {total} on the shelf" line) / 7.75 (chosen ground) |
| `--primary-bg` / `--primary-ink` | primary buttons ("I grabbed something", "Save", "Sign in") | `#7a4a26` / `#fff3dc` | honey `radial-gradient(120% 150% at 50% 0%, #f6cd88 0%, #e6ac62 55%, #d6964c 100%)` / `#2b1708` | mock-up `.bt` | ≥4.5 → 6.78 |
| `--primary-shadow` | the primary button's ledge and glow at rest | `0 5px 0 #5c3a1d` | `inset 0 1px 0 rgba(255,244,220,.4), inset 0 -3px 4px rgba(150,80,20,.16), 0 3px 1px #84522a, 0 8px 22px rgba(240,150,60,.26)` | mock-up `.bt` | — |
| `--primary-shadow-active` | the primary button while pressed | `0 1px 0 #5c3a1d` | `inset 0 1px 0 rgba(255,244,220,.4), inset 0 -3px 4px rgba(150,80,20,.16), 0 1px 0 #84522a, 0 3px 10px rgba(240,150,60,.2)` | design choice | — |
| `--confirm-bg` / `--confirm-ink` | the keypad's confirm key | `#efb63c` / `#5c3a1d` | the same as the primary button (honey / `#2b1708`) | design choice (reusing the mock-up's primary button) | ≥4.5 → 6.78 |
| `--confirm-shadow` / `--confirm-shadow-active` | the confirm key's ledge at rest / pressed | `0 4px 0 #9c6e14` / `0 1px 0 #9c6e14` | the same as `--primary-shadow` / `--primary-shadow-active` | design choice | — |
| `--btn-ledge` | the secondary button's ledge (at rest and pressed) | `#d3bc92` | `#0f0a07` | design choice | decorative |
| `--paper` | secondary buttons, hover, default badge, disabled inputs | `#fbf3e0` | `#2a2017` | design choice | body text 13.05; secondary text 6.75 |
| `--chosen` | selected cards, link panel | `#fff8e6` | `#2e2318` | design choice | body text 12.55; secondary text 6.49 |
| `--frame` | the selected card's border, the top border of a sheet on phones, the intro text box's border | `#7a4a26` | `#b98c58` (caramel ring colour) | mock-up (the slots' caramel ring); design choice (selected card border, sheet top border, intro text box border) | ≥3 → 5.08 (chosen ground) |
| `--intro-ledge` | the intro text box's ledge | `#5c3a1d` | `#0f0a07` | design choice | decorative |
| `--link-panel-border` | the link panel's dashed border | `#c98f1f` | `#b98c58` | design choice | decorative |
| `--bar-bg` / `--bar-ink` / `--bar-shadow` | the log's header bar | `#7a4a26` / `#fff3dc` / `none` | `linear-gradient(180deg, #2c2118, #251c15)` / `#ecbc7c` / `inset 0 -1px 0 rgba(255,214,160,.07)` | mock-up `.log-h` | ≥4.5 → 9.01 (the expand toggle has 0.9 opacity and is computed separately, as in §13) |
| `--bar-dot` | the small diamond before the log title | `#efb63c` | `#e6ac62` | design choice | decorative |
| `--pill-bg` / `--pill-ink` | the current-page pill (top navigation, name menu) | `#7a4a26` / `#fff8e6` | `#ecbc7c` / `#2b1708` | design choice | ≥4.5 → 9.81 |
| `--skip-bg` / `--skip-ink` | "Skip to content" | `#5c3a1d` / `#fff8e6` | `#ecbc7c` / `#2b1708` | design choice | ≥4.5 → 9.81 |
| `--bubble-bg` / `--bubble-ink` | the small name bubble on a slot | `#7a4a26` / `#fff3dc` | `#ecbc7c` / `#2b1708` | design choice | ≥4.5 → 9.81 |
| `--line` | hairline borders and dividers between sections (badges, option cards, name button, checklist box, logo preview, sheet grip, the bar after a month heading, `.menu-nav`, `fieldset.group`, `.auth-foot`) | `#e4d2ae` | `#3a2b1f` | design choice | decorative, no target |
| `--row-line` | the lines between list rows (see the notes below) | `var(--line)` | `#2e2219` | mock-up `.rw` | decorative, no target |
| `--rule-style` | the line style of the lines between list rows | `dashed` | `solid` | mock-up `.rw` (assumption 21) | — |
| `--slot-bg` / `--slot-border` / `--slot-shadow` | filled slots, icon-picker slots (`.slot`, except empty slots) | `#efdcb6` / `#a9793f` / today's two-layer inset shadow, line 145 | porcelain `radial-gradient(circle at 50% 40%, #fdf3e1 0%, #f1dfc0 70%, #e7cfa4 100%)` / `#b98c58` / `0 2px 4px rgba(0,0,0,.4)` | mock-up `.sl li` | ring ≥3 → 4.01 (lamp centre) |
| `--slot-empty-bg` / `--slot-empty-border` / `--slot-empty-shadow` | only the empty slots on the shelf, `.slots > .slot:not(.filled)` | `var(--slot-bg)` / `var(--slot-border)` / `var(--slot-shadow)` | `radial-gradient(circle at 50% 35%, #1d150f, #130d0a)` / `#5e4632` / `inset 0 2px 4px rgba(0,0,0,.55)` | mock-up `.sl li.empty` | decorative, no target |
| `--slot-ink` | text in a slot (the "—" when picking an icon) | `var(--ink)` | `#4a2f1b` | design choice | ≥4.5 → 8.09 (porcelain) |
| `--face-bg` / `--face-ring` / `--face-pad` / `--face-box` | the porcelain medallion for a single picture (the canvases of the header mascot, the sign-in mascot, the "next item" picture, benefit icons) | `none` / `none` / `0` / `border-box` | `radial-gradient(circle at 50% 42%, #fff4de 0%, #f3dcb3 65%, #e6c793 100%)` / `0 0 0 1px rgba(255,214,160,.22), 0 2px 4px rgba(0,0,0,.45)` / `3px` / `content-box` | mock-up `.hd canvas` (header); design choice (elsewhere, §2) | — |
| `--mascot-radius` | corner radius of the header mascot button `.mascot` (also sets the focus ring's shape) | `8px` | `50%` | mock-up `.hd canvas` (round, assumption 7) | — |
| `--row-icon-size` | the benefit icon's box, `.row-icon` | `36px` | `42px` | design choice (room for a 36px picture plus 3px padding on each side) | — |
| `--pic-bg` / `--pic-ring` / `--pic-pad` / `--pic-box` | the three pictures on a theme card (`.theme-card-pics canvas`) | `none` / `none` / `0` / `border-box` | the same porcelain as the collection slots, a ring in the caramel ring colour (drawn as a shadow), `3px`, `content-box`; a rounded square | design choice | — |
| `--brand-logo-bg` / `--brand-logo-pad` | the header logo `.brand-logo` (8px radius unchanged) | `var(--tile)` / `0` | porcelain (the `--face-bg` gradient) / `3px` | design choice (assumption 20) | — |
| `--auth-logo-bg` / `--auth-logo-pad` / `--auth-logo-radius` | the sign-in logo `.auth-logo` | `none` / `0` / `0` | porcelain / `6px` / `18px` | design choice (assumption 20) | — |
| `--logo-preview-bg` | the logo preview in Settings | `var(--paper)` | porcelain | design choice (assumption 20) | — |
| `--field-bg` / `--field-border` | inputs, selects, text areas (those in `.field`, and the language select `.language select`) | `var(--tile)` / `var(--line)` | `#140e0a` / `#8a705c` | design choice | text ≥4.5 → 15.67; border ≥3 → 3.32 (in the link panel, on the chosen ground) |
| `--key-bg` / `--key-border` / `--key-ledge` | the keypad's keys | `#f6ebd2` / `#d9c09a` / `#c9a874` | `#2c2118` / `#3d2e22` / `#0f0a07` | design choice | text ≥4.5 → 12.85 |
| `--amount-zero` | the keypad amount when it is 0 | `#d9c4a6` | `#b9a68b` | design choice (assumption 25) | ≥4.5 → 7.31 |
| `--focus` | focus ring, the frame round the selected slot when picking an icon | `#0f6f7a` | `#7fd3dc` (light teal) | design choice (assumption 24) | ≥3 → 7.06 (lamp centre) |
| `--control-accent` | the fill of radio buttons and checkboxes | `#7a4a26` | `#e6ac62` | design choice | — |
| `--warn-bg` / `--warn-border` / `--warn-ink` | notices (lock notices, the home-screen tip; their text uses `--ink`), the "pending" badge | `#fff3cf` / `#efd28a` / `#7a5200` | `#3a2a12` / `#8a6a2a` / `#f5d48a` | design choice | body text 11.31; badge text 9.65; the tip's title and button (`--accent`) 7.93 |
| `--ok-bg` / `--ok-border` / `--ok-ink` | the "done, open, active" badges | `#e7f3ea` / `#b9dcc4` / `#245c39` | `#1c2a1e` / `#3f6b48` / `#9fd8a8` | design choice | ≥4.5 → 9.19 |
| `--bad-bg` / `--bad-border` / `--bad-ink` | form errors (ground and text), the "declined, taken back, voided, closed, deactivated" badges | `#f8e4e1` / `#e8b9b2` / `#8e2f25` | `#3a1c17` / `#7a3a2e` / `#f4a58e` | design choice | ≥4.5 → 7.82 |
| `--toast-bg` / `--toast-border` / `--toast-ink` / `--toast-shadow` | toasts | `#7a4a26` / `#5c3a1d` / `#fff3dc` / `0 4px 0 #5c3a1d, 0 10px 26px rgba(74,47,27,.35)` | `#2c2118` / `#5e4632` / `#f4e7d0` / `0 4px 0 #0f0a07, 0 10px 26px rgba(0,0,0,.5)` | design choice | ≥4.5 → 12.85 |
| `--toast-error-bg` / `--toast-error-border` / `--toast-error-ink` / `--toast-error-shadow` | error toasts | `#b83f33` / `#93342a` / `#fff3dc` / `0 4px 0 #93342a, 0 10px 26px rgba(74,47,27,.35)` | `#5a271d` / `#8e3f30` / `#fbe3da` / `0 4px 0 #3a1c17, 0 10px 26px rgba(0,0,0,.5)` | design choice | ≥4.5 → 9.81 |
| (not a variable) the scrim behind dialogs | `.dialog::backdrop` | `rgba(58,36,17,.45)` | `rgba(0,0,0,.6)` (`[data-theme="cafe"] .dialog::backdrop`) | design choice; why not a variable, see §4.2 | — |

Notes:

- **The focus ring** is always drawn outside the control (`outline-offset`) and lands on the page, a tile, the balance tile's lamp (the slot buttons on the shelf), paper, the chosen ground (link panel), the input ground, the notice ground (the button in the home-screen tip) or the log bar; every stop of these grounds is checked, and the lowest is 7.06 at the lamp centre. It never lands on porcelain.
- **Input borders** are checked against both the ground beside them and their own ground: tile, input ground, paper (when disabled), the chosen ground (the link input in the link panel); the lowest is 3.32. The language select (`.language select`) is not a `.field` but also uses `--field-*`, so it reaches 3:1 on the sign-in page and in the name menu too.
- Every text colour in the mock-up passes 4.5:1 against every stop of its ground; so does everything the table fills in. A few places in Pastry shop fall short of 4.5:1 today (for example the grey keypad amount at 0); this round does not change them (Pastry shop does not change by one pixel) and only requires all of Café to pass.
- **Opacity**: 0.3 uses `opacity` to fade disabled buttons, locked cards, the name while signing out and the log's expand toggle (lines 94, 170, 191, 290). For how disabled and locked things look in Café, see assumption 37; contrast is computed with the `opacity` of the element and its ancestors multiplied in (§13).
- **Team logo** (assumption 20): today's rounded square (header 32px with an 8px radius; sign-in page 72px, with the radius scaled up to 18px), filled with the porcelain gradient instead of `--tile`, with a little padding, and `object-fit: contain` unchanged; the Settings preview also sits on porcelain. The medallion is only for the mascot and single pictures, not for logos (logos come in every shape and would be cropped or shrunk inside a circle). A logo that reads on Pastry shop's cream reads just as well in Café.
- **Row lines** (assumption 21): the lines between list rows — each log row `.rec`, each Team-page and benefit row `.row`, the list of names when sending a treat `.check-list li`, the top border of a month heading in the log `.quest-month` (app lines 196, 200, 231, 305; in the demo `.rec`, `.recent-row`, `.quest-month`) — use the colour `--row-line` and the line style `--rule-style`: Pastry shop and Bakery have today's `--line` and dashed, Café has `#2e2219` solid. The dividers between sections — `.menu-nav` in the name menu, the form groups `fieldset.group`, the sign-in card's footer `.auth-foot`, and in the demo `.stats`, `.nudge` and the footer — keep `--line`'s colour and the dashed style in Café. Only colour and line style change; the app still uses `border-top` with none on `:first-child`, so "none under the last row" needs no change in structure.
- **How the porcelain medallion is built** (`--face-*`, and likewise `--pic-*` for the theme cards): the canvas itself keeps its full drawing size. `setupCanvas` writes the canvas's width and height as the drawing size (`assets/sprites.js` lines 909–914), and `* { box-sizing: border-box }` (`app/app.css` line 28) would let the padding eat into the drawing area: a 36px picture would get only 30px, 2.5px per pixel, and blur (the mock-up avoids this with `box-sizing: content-box`). So in Café these canvases use `content-box` (through `--face-box`), with the 3px padding added outside the canvas. The boxes around them grow to match: the benefit icon's `.row-icon` is 42×42 in Café (`--row-icon-size`; 36px in light, line 249); the "next item" line and the header grow with their content anyway, by 6px. In Pastry shop and Bakery these variables (the padding included) are `0`, `none` and today's values, so nothing changes.

### 4.7 Always Dark

Café ignores the system's dark mode, and so do Pastry shop and Bakery: the stylesheet gains no `prefers-color-scheme`. When a team uses Café, every member sees it dark on every device.

## 5. No Light Flash

**The first paint is already dark**:

- A new file, `app/early-theme.js`: a very small classic script in the `<head>` of `app/index.html`, before the stylesheet, with no `defer` or `async`. The browser stops to run it as soon as it reaches it, and only then reads on and starts painting, so the `data-theme` it sets is there before the first paint.
- It does one thing: it reads `crumb.theme` from device storage (named like the language's `crumb.locale`) and, if the value is shaped like a theme id (2 to 32 lowercase letters and digits, starting with a letter), sets it on `<html>`; if nothing is there, storage is disabled or reading throws, it does nothing (light). It does not know the list of themes, so it needs no change when themes are added later; if the stylesheet has no colours for that theme, the page is light. It does not touch the browser bar colour (assumption 40).
- The security policy allows it (§4.4). The cost is one more very small request on every open (the server answers every file with `Cache-Control: no-store`, `server/app.mjs` lines 79–82).
- Every time it gets a session, `applyTheme` writes or deletes `crumb.theme` by the table in §4.1.

**Cases**:

| Case | Result |
| --- | --- |
| This device has opened a café team's page before | The first paint is dark; even the "Loading Crumb…" line is light text on dark. |
| A new device, opening for the first time | Nothing is recorded on the device yet: the "Loading Crumb…" moment is light; the page turns dark as soon as the session arrives, and this is remembered; no flash from then on (assumption 16). |
| The device remembers a light theme (Pastry shop or Bakery), and the team has switched to Café on another device | The "Loading Crumb…" moment is light; the page turns dark as soon as the session arrives, and the record becomes `cafe`; no flash from then on (assumption 16). |
| Signing out | The team is still there, so the sign-in page stays dark; the record is not deleted — it is the team's theme, not anything personal (assumption 15). 0.3's path where, after signing out, the follow-up question about who is signed in gets no answer (the team information that `app/main.js` lines 219–228 builds itself carries `theme`) is dark too. |
| Switching to Café in Settings and saving | The whole page turns dark at once, the record becomes `cafe`, the tab icon changes, and the browser bar turns dark. |
| Switching from Café back to Pastry shop or Bakery | The whole page returns to light at once, the record changes, the browser bar colour tag is removed so the bar returns to the browser's default, and the tab icon returns to Pastry shop's through `icons/default/`, as in 0.3. |
| The device remembers Café, but the team no longer uses it (changed on another device, or the server was reset and is back at the setup page) | Dark for a moment, then drawn in the actual theme as soon as the session arrives (the setup page is light); the record is changed or deleted to match (assumption 17). |
| The phone's browser bar | When a café page opens, the bar is the browser's default colour at first and turns dark only when the session arrives (assumption 40). |
| The static copy on GitHub Pages (`/crumb/app/`, no server) | There is never a session at this address, so `crumb.theme` is never written; and the "no server here" page (`noServer()`) explicitly removes `data-theme`, so it is always light (assumption 23). The demo uses a different key (`crumb_demo_theme`), so the two never mix. |

**The demo** does not flash either: the `<head>` of `index.html` gains an equally small `assets/early-shop.js`, which reads the shop the demo itself remembers (`crumb_demo_theme`) and sets `data-theme` before the first paint (§8).

The one extra item stored on the device is the team's theme id; it is not personal information and does not follow a person. The comment in `app/i18n.js` on "what the browser keeps for this device" and the same passage in `docs/DEPLOYMENT.md` gain it (§14).

## 6. What Changes on Each Page

A café team sees (every drawing is Café's, and the wording uses §7's sentences):

- **Member page**: a dark page with a faint lamp glow at the top. Header: the mascot on a porcelain medallion, the team name in caramel. Balance tile: a warm pool of light like a desk lamp, the name in `#f6ead6`, the unit in caramel (`#ebbd84`), the digits in cream; filled slots are porcelain with a ring in the caramel ring colour, empty slots are dark holes; below them the line "{name} is coming right up", its small picture on a porcelain medallion. "I grabbed something" is a honey button with dark text. The log header bar has caramel text on dark brown, rows are divided by solid dark lines, with none under the last row; plus is soft green, minus is coral. Benefit icons in the benefit list sit on porcelain medallions. The home-screen tip and notices are on a dark amber ground.
- **Opening animation**: dark ground, Hot Coffee pops in with its steam moving; the text box is a dark tile with a border in the caramel ring colour, and the sentence is "Today’s treats are served!".
- **Team page**: dark tiles; the send-a-treat dialog (on phones, a sheet rising from the bottom), checkboxes, badges, the porcelain icon-picker slots and the focus ring all use §4.6's colours; the QR code is still a white plaque.
- **Settings page**: dark, coloured by the team's theme as soon as it has the session (§4.1). Dropdowns and the logo upload button turn dark with it (`color-scheme`). The lock notice uses the notice colours. The logo preview sits on porcelain.
- **Theme cards** (Settings page): each card carries its own theme's colours. The café card: a dark tile, cream text, its three pictures on porcelain slot faces; the Pastry shop and Bakery cards stay light inside the dark page. Selecting one only changes the unlock-step hint, as in 0.3; the whole page changes colour only **after saving** (§4.1). Once locked (the team has sent a treat): inside a café page, a card keeps its own ground and only its contents fade, so the Pastry shop and Bakery cards stay light when locked (assumption 37); if the whole card faded as in 0.3, a light card over the dark page would turn into a greyish-brown in-between colour. The gate 3 screenshots include both states (selectable and locked).
- **Sign-in page** (and the invitation, password reset and sign-in link pages): a dark tile, the brand mascot on a porcelain medallion, the pixel wordmark "CRUMB" in caramel, the team logo on a porcelain rounded square (assumption 20), dark inputs.
- **Spend keypad**: a dark sheet, with a line in the caramel ring colour along its top edge on phones; the amount is cream, in the secondary text colour when it is 0, and coral when it exceeds the balance; the keys are dark brown with cream digits; "Cancel" is a secondary button and the confirm key is honey (when the keypad has just opened and no amount has been entered, the confirm key is disabled; for how that looks, see assumption 37).
- **Toasts, dialogs, form errors**: §4.6's colours.
- **Browser tab icon, home-screen icon**: Hot Coffee on a dark ground. An icon already on a phone's home screen changes only when it is added again (already in the operations guide since 0.3).

**The setup page stays light**: there is no team yet, and `<html>` carries no `data-theme`. Of the three cards, the café one is dark. Selecting the café card does what 0.3 does: the mascot at the top of the page becomes Hot Coffee (drawn on the light page, which is itself a cream ground), and the unlock-step hint becomes Café's; the page does not turn dark. Once the team is set up and the session arrives, the page turns dark.

**Pastry shop and Bakery teams**: apart from the extra café card on the setup and Settings pages and the extra "Café" button in the demo, not one pixel changes (tests in §13).

## 7. Wording

**Sentences that follow the theme** (approved, copied exactly; Pastry shop's and Bakery's sentences do not change by a word):

| Where | Key | Chinese | English |
| --- | --- | --- | --- |
| Theme card | `card` in the `cafe` theme entry | 咖啡店 · {count} 款咖啡和甜点 | Café · {count} coffees and sweets |
| Unlock-step hint (credit) | `setup.thresholdCredit.cafe` | 一个金额，比如 50.00。谁收到的下午茶每攒够这么多，就多上一份咖啡或甜点。 | An amount like 50.00. Every time someone’s treats add up to another step this size, another coffee or something sweet is served. |
| Unlock-step hint (points) | `setup.thresholdPoints.cafe` | 一个整数，比如 100。谁收到的下午茶每攒够这么多，就多上一份咖啡或甜点。 | A whole number like 100. Every time someone’s treats add up to another step this size, another coffee or something sweet is served. |
| The "next item" line | `me.inOven.cafe` | {name} 马上就好 | {name} is coming right up |
| Opening animation | `intro.title.cafe` | 今天的下午茶上桌啦 | Today’s treats are served! |
| Notice after a treat is sent | `grant.unlocked.cafe` | 顺便又上了 {count} 份。 | And {count} more came up at the counter. |
| Team page, the "Member" role | `members.roleDetail.member.cafe` | 看自己的下午茶和咖啡甜点，自己花。 | Sees their own treats, coffees and sweets, and spends. |
| Explanation when taking a treat back | `revoke.explain.cafe` | 会加一笔冲回去的记录，原来那笔照旧留着、标成已收回。已经上过的咖啡和甜点不会收走。 | A reversing entry goes in; the original stays, marked as taken back. Coffees and sweets already served stay on the shelf. |

The count: §1's "8 places in the app" = 1 theme card (in the theme entry) + 7 keys; 7 keys × Chinese and English = 14 sentences.

The theme's name is in `label` in the `cafe` theme entry: English "Café", Simplified Chinese "咖啡店". The café verb is 「上」 (上一份, 上桌, 马上就好); desserts are "sweets" in English because "treat" already names the credit.

**Two keys newly follow the theme**: `me.inOven` and `intro.title`. In 0.3 both themes share them ("{name} is in the oven", "Today’s treats are out of the oven!"); Café has its own versions, so they join `THEMED_KEYS` in `app/i18n.js`, and the list grows from 5 keys to 7. Pastry shop uses the base keys; Bakery has no versions of its own for these two and still uses the base keys, so Bakery's text does not change either. The page looks them up through `themed()`: the opening animation in `app/main.js` (line 557) uses the team's theme; the "next item" line in `app/views/member.js` (line 82, which today uses `t()` directly through `boldName`) uses the theme id returned by `/api/me`.

**How the tests count** (`tests/i18n.test.mjs`):

- The test "every key that follows the theme is looked up only through `themed()`" stays, and now counts `me.inOven` and `intro.title` too.
- In the test "a theme's own sentences have a base key and the same placeholders", the hard-coded "Bakery has its own version of every key" becomes a list per theme: Bakery has 0.3's 5, Café all 7.
- A new test, like 0.3's pin on `settings.theme`, pins the 14 sentences in the table above and the theme entry's `label` and `card` word for word.
- "Only sentences that follow the theme mention pastries" and "no interface text contains recognition" stay as they are.

`me.complete` ("All {total} on the shelf. Treats still count, of course.") is not on the approved list; Café keeps using it (assumption 27).

**New sentences needing approval this round** (in the demo only, §8):

| Where | Now (used by Pastry shop and Bakery) | Café candidate (needs approval) |
| --- | --- | --- |
| The demo's opening animation text | Today’s perks are out of the oven! | Today’s perks are served! |
| The demo's notice after a treat that unlocked an item (the amount follows the button pressed) | $50.00 added — {name} came out of the oven! | $50.00 added — {name} came up at the counter! |
| The demo tour's second line (`assets/app.js` line 1099, hard-coded today, not in `TEXT`) | `<b>{name}</b> comes out of the oven.` | `<b>{name}</b> comes up at the counter.` |

The third one moves into `TEXT` (a new key, e.g. `tourGrant`), with today's sentence, not a word changed, as Pastry shop's and Bakery's value; only then can it follow the shop. Until approval, Café uses the "Now" column (assumption 13). At which gate the three are approved, see assumption 33. New README and documentation sentences go through gate 2 separately (§13, §14).

## 8. The Public Demo

- **The switch**: three buttons, "Pastry shop | Bakery | Café" (approved), still next to "Take control" and outside `.stage`. The three buttons stay within the page at phone width too (0.3 has this test; it runs again with the third button).
- **The shutter**: timing and steps as in the 0.3 design §7.1. The colours change when the shutter is down and the sign is at its narrowest, at the moment the shop swaps (`swap` in `assets/app.js` lines 692–696, at about 383 ms). The roller shutter is only a layer inside the phone (`assets/app.js` lines 678–688 put it in `#phone`) and covers only the phone: inside the phone, the shutter rolls up on the candle-lit café; outside the phone (the list, the numbers, the admin column, the cards, the cabinet, the footer), if those change colour too (assumption 8), they go from light to dark in one step at the swap, in plain view, with nothing covering them. Leaving the café works the same way. With reduced motion there is still no shutter: the switch is instant, and the colours change at the same moment.
- **The sign is drawn before the theme changes**: in `swap`, `drawSign(name, to)` draws the new shop's name first and `setTheme(to)` runs after; `drawSign` uses the page's `--ink` at that moment, so if the shutter and sign changed colour with the theme, the new shop's name would be drawn in the old shop's colour on a sign in the new shop's colour (switching from Pastry shop to Café, for example: dark brown text on a sign that has already turned dark, which cannot be seen). The approach (assumption 9a): **the shutter and sign are the same for all three shops** — a wood-coloured shutter, a cream sign, dark brown text — using a few variables only for the shutter (`--shutter-slat`, `--shutter-seam`, `--sign-bg`, `--sign-border`, `--sign-ink`), written in a separate `:root` set outside the set that changes with the theme, and not overridden by Café; `drawSign` reads `--sign-ink`. That way drawing first and switching after cannot go wrong, and the shutter does not change colour by itself at the moment of the switch. The colour test's "every variable has a value" does not cover this set (§13). A test pins that the sign's text colour is the same in all three shops.
- **The text on the sign**: the pixel font has only capital letters and no "É" (`LETTERS` in `assets/sprites.js`), so "CAFÉ" would be drawn with a letter missing. The sign reads "CAFE" (accent dropped, then capitalised; assumption 9b).
- **Colours**: `assets/style.css` changes the way §4 describes: the light variables on the root element and on elements with `data-theme`, followed by `[data-theme="cafe"]` with the same values as the app's Café (assumption 22). But the demo's variables and parts differ from the app's (its focus ring is `--select`; its `--ink-soft`, `--plus` and `--minus` already differ from the app's today; and it has parts the app lacks, such as the phone frame, the switch and the person buttons), so the table below gives each one. Colours hard-coded today become variables: the background pattern (lines 49–50), shadows (lines 97, 356), light text on wood and the selected ground `#fff8e6` (lines 107, 241, 300, 447, 601), the scrim (line 562), the dashed "app-only" slot `#e6d3ab` (lines 680, 688). Canvas colours become reads from variables: the balance digits (`assets/app.js` lines 345, 352, read once per `renderBalance`, not every frame), the pixel wordmark "CRUMB" (line 922) and the small downward chevron (`CHEVRON`, line 919); the last two are drawn only once on load today, and are redrawn on every shop switch instead. `setTheme` sets `data-theme` first and then redraws, so the tab icon (`tabIcon` reads `--bg`) and these canvases all get the new shop's colours. The confetti's three golds do not change (assumption 14).

| Demo variable or part | Pastry shop, Bakery (today) | Café | Source |
| --- | --- | --- | --- |
| `--bg` | `#f2e7ce` | `#160f0a` (plain: `tabIcon` writes it into an SVG `fill`, and the phone screen and opening animation use it too) | as in the app |
| `--page-art` (new, the page's `background-image`) | the fine grid, lines 49–50 | the app's lamp glow | as in the app |
| `--phone-art` (new, the `background-image` of the phone screen `.phone`) | `none` | the app's lamp glow (the phone screen shows the app's page); the opening animation `.oven` uses only the plain `--bg` | design choice |
| `--tile` | `#fffdf6` | the tile gradient | as in the app |
| `--paper`, `--ink`, `--line`, `--slot-bg`, `--slot-border` | today's values | the app's café values | as in the app |
| `--ink-soft` | `#8a6a4c` (differs from the app's) | `#b9a68b` | as in the app |
| `--plus` / `--minus` | `#3e8e5a` / `#c4483c` (differ from the app's) | `#9fd8a8` / `#f4a58e` | as in the app |
| `--select` (the demo's focus ring) | `#2bc8d6` | `#7fd3dc` | the app's `--focus` |
| `--accent` (new): the text accent — `.tagline`, links, `.stats dd`, `.caption`, `.demo-note b`, `.nudge b`, `.tick`, `.quest-month`, `.oven-text`, `.head-brand`, `.oven-caption b`, `.section-head h2`, `.more:hover`, footer links, switch button hover | `--wood` `#7a4a26` | `#ecbc7c` | as in the app |
| The "Take control" button `.get` (`--get-bg`, `--get-ink`, `--get-ledge`) | `--wood`, `#fff8e6`, `--wood-deep` | the honey gradient, `#2b1708`, `#84522a` | design choice (like the app's primary button) |
| The pressed button in the switch (`--switch-on-bg`, `--switch-on-ink`) | `--wood`, `--tile` (line 137 uses `--tile` as a text colour) | `#ecbc7c`, `#2b1708` | design choice |
| The app icon at the top of the list, `.app-icon` (`--app-icon-bg`, `--app-icon-border`, `--app-icon-shadow`) | `--slot-bg`, `--slot-border`, `0 8px 20px rgba(92,58,29,.16)` | `#160f0a`, `#5e4632`, `0 8px 20px rgba(0,0,0,.5)` | design choice (assumption 11) |
| The phone frame `.phone-frame` (`--bezel`, `--bezel-shadow`) | `--wood-deep`, `0 14px 34px rgba(92,58,29,.18)` | `#2c2118`, `0 14px 34px rgba(0,0,0,.5)` | design choice |
| A pressed person button `.person` (`--frame`, `--chosen`) | `--wood`, `#fff8e6` (lines 241, 300) | `#b98c58`, `#2e2318` | as in the app |
| The $50 / $100 buttons `.grant` (`--grant-bg`, `--grant-ledge`, `--grant-ink`) | `--gold`, `--gold-deep`, `--wood-deep` | the honey gradient, `#84522a`, `#2b1708`; still fade when disabled (assumption 37) | design choice |
| Highlight `.tile.highlight` (`--highlight`) | `--gold` | `#ecbc7c` | design choice |
| The small dot on the log bar `.quest-head .dot` (`--bar-dot`) | `--gold` | `#e6ac62` | as in the app |
| The small rule strip on a card, `.card .rule` (`--rule-bg`, `--rule-ink`) | `--slot-bg`, `--wood-deep` | `#2e2318`, `#ecbc7c` | design choice |
| The legend's small squares `.legend i` | `--slot-bg`, `--slot-border` | follow the variables (porcelain, caramel ring colour) | as in the app |
| The dashed "app-only" slot and its legend (`--limited-bg`) | `#e6d3ab` | `#2a2017` (unused in Café, assumption 3c; only for completeness) | design choice |
| The scene dots `.scene-dots` (off `--line`, on `--dot-on`) | `--line`, `--gold-deep` | `#3a2b1f`, `#ecbc7c` | design choice |
| The small name bubble on a slot, `.pastry-name` (`--bubble-bg`, `--bubble-ink`) | `--wood-deep`, `#fff8e6` | `#ecbc7c`, `#2b1708` | as in the app |
| The sheet's scrim `.sheet-scrim` (`--sheet-scrim`; it is an ordinary element, so a variable works) | `rgba(74,47,27,.34)` | `rgba(0,0,0,.6)` | design choice |
| Keypad `.key`, "Cancel" | `--paper`, `--line` | follow the variables | as in the app |
| The confirm key `.btn-confirm` (`--confirm-bg`, `--confirm-border`, `--confirm-ink`) | `--gold`, `--gold-deep`, `--wood-deep` | the honey gradient, `#84522a`, `#2b1708` | as in the app |
| Toast `.toast` (`--toast-bg`, `--toast-ink`); error toast `.toast.error` (`--toast-error-bg`, `--toast-error-ink`) | `--wood-deep` + `#fff8e6`; `--minus` + `#fff8e6` | `#2c2118` + `#f4e7d0`; `#5a271d` + `#fbe3da` | as in the app |
| The small downward chevron (canvas, `--chevron`) | `#8a6a4c` | `#b9a68b` | design choice |
| Balance digits, "CRUMB" (canvas, `--digit`, `--wordmark`) | `#4a2f1b` | `#f9e0b4`, `#ecbc7c` | as in the app |
| Shutter and sign (the separate `:root` set) | `#7a4a26`, `#5c3a1d`, `#fffdf6`, `#5c3a1d`, `#4a2f1b` | unchanged | assumption 9a |

  Variables that must be plain colours: `--bg` (a script writes it into SVG), `--digit`, `--wordmark`, `--chevron`, `--sign-ink` (read by scripts to draw canvases) and every variable used as a text colour. `--tile` is used as a text colour today at line 137 (the text of the pressed button in the switch); that place switches to its own `--switch-on-ink`, so that `--tile` can hold a gradient. The app icon at the top of the list uses its own `--app-icon-*`, so it can be dark (assumption 11) while the collection slots stay porcelain. The demo's `--wood`, `--wood-deep`, `--gold` and `--gold-deep` are removed after the split (the shutter uses its own variables).
- **What switches to Café in the café**: the shelf and the "next item" line ("{name} is coming right up", the app's approved English sentence, assumption 12); the header mascot and its accessible name "Mascot: hot coffee"; the app icon at the top of the list (dark ground, like the home-screen icon, assumption 11); the opening animation's cup and steam; the browser tab icon (Hot Coffee on dark, as in the app); the cabinet; the small pictures on the three cards; the numbers (24 items, a single legend line of 24, assumption 3c).
- **Tapping the mascot**: in the café it shakes and the steam runs one cycle, with no crumbs, as in the app. The "bite" **after a spend** (`biteMascot`, which the 0.3 design §7 calls the "bite") also becomes one steam cycle in the café: biting a cup makes as little sense as a cup spilling crumbs (assumption 10). Pastry shop and Bakery still bite and spill crumbs.
- **Reduced motion**: in the café, after a spend (the moment that replaces the bite) and on tapping the mascot, the canvas does not change — the cup and all its steam stand still, shown in full (§1: with reduced motion, no animation at all). Pastry shop and Bakery as in 0.3: with reduced motion, a spend still draws the bitten look once and restores it after 900 ms (`assets/app.js` lines 742–759), unchanged.
- **A mascot animating during a shop switch** (assumption 41): before `setTheme` redraws, it cancels any bite or steam in progress; every steam loop stops when it finds its canvas no longer in the page (`setTheme` removes the opening animation directly, not through `dismiss()`, so the opening animation's steam loop has to notice this itself); whether a cycle is steam or a bite is decided once, by the mascot at the moment it starts, and does not change midway. So a bite started in Pastry shop does not go on to bite the coffee cup behind the shutter, and steam started in the café is not drawn onto Pastry shop's mascot when the shutter rolls up. In 0.3, switching mid-bite goes on biting the new shop's mascot (the comment on `biteMascot`, lines 740–760); this changes accordingly.
- **The café's wording** (approved, copied exactly):

| Where | Key (`TEXT.cafe`) | English |
| --- | --- | --- |
| Switch | — | Pastry shop \| Bakery \| Café |
| The mascot's accessible name | `mascot` | Mascot: hot coffee |
| Tour, first line | `tourFirst` | `<b>Sam</b> is six months in. Six coffees and sweets on the shelf, $84.25 to spend.` |
| Tour, last line | `tourLast` | `<b>Alex</b>, two years in: nineteen coffees and sweets, in an order nobody else has.` |
| Toast after spending | `spent` | the shelf keeps every cup and plate ☕ |
| Step on the right | `stepGrant` | watch a coffee come up at the counter |
| Step on the right | `stepSwitch` | different coffees, same rule |
| First card | `keep` | Spend your whole balance and your coffees stay. |
| First card's rule | `keepRule` | $50 received = 1 coffee or sweet |
| Second card's rule | `hideRule` | “Latte is coming right up” |
| Cabinet heading | `cabinet` | The café counter |

  The mascot's name is provisionally "热咖啡 / Hot Coffee" and is settled at the drawing gate; if the name changes, the accessible name changes with it (a new sentence needing approval, see assumption 33). For the tour's second line, see the third sentence awaiting approval in §7 (new key `tourGrant`).
- **The small pictures on the three cards** (`CARD_ICONS.cafe`, assumption 3b): the first card `hotcoffee`, `latte`, `tiramisu` (the first three of the list, as for Bakery); the second `pourover` ("coming right up" paired with a pour-over mid-drip); the third `icedcoffee`, `madeleine`, `irishcoffee`, `dalgona`. In the café these pictures also sit on porcelain medallions (design choice, §2).
- **Memory**: still `crumb_demo_theme`, remembered for all three shops; "Reset the demo" does not clear it; a page opened with Café remembered is dark from the first paint (§5) and draws Café straight away, with no shutter.
- **Unchanged**: the summary at the top of the page ("unlocks a pixel pastry"), the "This is a demo" paragraph (which says "The bakery team"), the "🍞 Spend some credit" button, the daily lines `DAILY` and `DAILY_ZERO` (with their 🥐🍞🥖🍰🥯🧈) and the empty-log line "Nothing yet — tap the button when you take something 🍞" keep their text in the café (assumption 34); their colours still change with the page (for example, the "This is a demo" block uses `--paper` and `--line`). The origin story does not change. The link-preview image (`assets/og.png`) and its text (assumption 35), and the footer's signature image (it has its own cream ground and becomes a cream plaque on the dark page, assumption 36), also stay as they are.

## 9. Data and API

- **The list of themes**: the server's `THEME_IDS` comes from the list files in `themes/` (`server/themes.mjs` lines 12–19); with `themes/cafe.json` added it is `default`, `bakery`, `cafe`. The order of the cards on the page comes from the order of `Pixel.THEMES` (`themeIds` in `app/pixels.js`); `cafe` goes last, so the two agree.
- **No migration**: `organization.theme` is checked for length only (2 to 32 characters, `server/migrations/003-theme.sql`), and which themes exist is not written into the database. The database stays at schema 3.
- **No server code changes**: `theme` at setup and in Settings is validated with `oneOf(THEME_IDS)` (`server/org.mjs` lines 64, 135), which accepts `cafe` automatically; `/api/me`, `/api/admin/rewards`, unlocking and the benefit-icon check all follow the team's theme list; the signed-out team information also carries `theme` (`server/org.mjs` line 24), so the sign-in page can be dark; the icon route finds `app/icons/<id>/` by theme id. The API's shape does not change anywhere. The new file `app/early-theme.js` is served by the existing static file serving (`server/app.mjs` line 133), and the Docker image already copies all of `app/`.
- **Sample team and screenshots**: the theme checks of `npm run demo -- --theme cafe` and `node scripts/screenshots.mjs --theme cafe` need no change; they validate the theme against `THEME_IDS` (`scripts/demo.mjs`, `scripts/screenshots.mjs`). The screenshot script has a few more views to capture; see gate 3 in §13 and §10.
- **0.3 meeting a café database**:
  - On opening (`openDatabase` → `checkDatabaseTheme` in `server/db.mjs`): the team's theme `cafe` is not in 0.3's lists, so it is refused with `THEME_UNKNOWN` and the server does not start; `recover-owner` refuses it too.
  - On restoring a backup (`restoreDatabase` in `server/backup.mjs`, lines 129–151): a café team's backup is refused before the target file is created: the backup is first copied to a temporary file next to the target and its theme is checked there, and on refusal the temporary file is deleted at once, so nothing is left in the target folder. 0.3's `scripts/backup.mjs` can still back it up.
  - 0.3.0's tests already pin these: 0.3.0's test suite uses exactly `cafe` as "a theme this version does not have", and 0.3 refuses it (opening, restoring, `recover-owner`); the suite was run when 0.3.0 was released (`docs/VALIDATION.md`).
  - Pastry shop and Bakery teams' databases and backups open in both 0.4 and 0.3 (same schema, and 0.3 has those themes). So, rolling back from 0.4 to 0.3: Pastry shop and Bakery teams just switch back to the old image, with no restore; a café team can only restore its pre-upgrade backup or — if it has not sent a treat yet — first switch back to Pastry shop or Bakery in Settings and then roll back. This goes into the operations guide (§14).
- **Upgrading from 0.1 or 0.2 straight to 0.4**: possible. The first start runs migrations 002 and/or 003 as in 0.3; existing teams land on Pastry shop, and those that have already sent a treat are locked, so a team upgraded this way that has already sent a treat cannot use Café. Rolling back is only by restoring the backup made before the upgrade (0.2 does not accept a schema 3 database). The existing migration tests in `tests/db.test.mjs` already cover this path, and `docs/VALIDATION.md` says so when it is written up (§14).
- **Theme entry fields**: `THEMES.cafe` gains a `background` (§4.5, assumption 26), used only by the icon script and the page and **not written into** `themes/cafe.json`; the list files keep 0.3's fields. `default.json` and `bakery.json` do not change by one byte and stay at version 1; `cafe.json` is version 1.
- **Version**: 0.4.0 (`package.json` and the lock file).

## 10. Drawings and Files

- **`assets/sprites.js`**:
  - 16 new drawings (15 new coffees and the mascot); `hotcoffee` carries `steam`.
  - `NAMES` gains the three names of each of the 16 keys (settled at the drawing gate).
  - `THEMES` gains `cafe`: `{ mascot: 'hotcoffee', rotation: [the 24 from §2], limited: [], version: 1, label: { en: 'Café', 'zh-CN': '咖啡店' }, card: { en: 'Café · {count} coffees and sweets', 'zh-CN': '咖啡店 · {count} 款咖啡和甜点' }, background: '#160F0A' }` (`limited` is empty, assumption 3c).
  - `drawSprite` gains an optional step number; the steam step table and the step length (§3).
- **`scripts/theme-manifest.mjs`**: a few more rule checks — `background`, if present, must be `#RRGGBB`; the `steam` checks (§3: a palette character, exactly 4 rows, at least one pixel per wisp in each row, exactly 2 wisps, only on some theme's mascot, assumption 31). The steam's curve is not checked here (only in the `hotcoffee` unit test). Optional: refuse `nosuchtheme` as a theme id (tests use it as "a theme that will never ship", §13). The script still holds no theme data.
- **`scripts/make-icons.mjs`**: the function signatures become `iconPixels(Pixel, spriteKey, size, background = '#F2E7CE')` and `faviconSvg(Pixel, spriteKey, background = '#F2E7CE')`; `writeIcons` passes `THEMES[id].background ?? '#F2E7CE'`.
- **Generated** (`npm run themes`): `themes/cafe.json`; `app/icons/cafe/favicon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png`.
- **New files**: `app/early-theme.js`, `assets/early-shop.js` (§5).
- **Changed**: `app/index.html` (the small script in `<head>`), `app/app.css` (§4), `app/main.js` (`applyTheme`, the opening animation's sentence), `app/pixels.js` (reading style variables, the theme's `background`), `app/motion.js` (steam: tapping the mascot, the opening animation), `app/i18n.js` (`THEMED_KEYS`, the comment on what is stored), both language files (14 sentences), `app/views/member.js` (digit colour, the "next item" line, `ctx.applyTheme(me.theme.id)`), `app/views/auth.js` (wordmark colour), `app/views/shared.js` (cards carry `data-theme`), `app/views/settings.js` (`ctx.applyTheme`: on saving and on getting the session); the demo's `index.html` (third button, small script), `assets/style.css`, `assets/app.js` (the new `TEXT` key `tourGrant`, cancelling an animating mascot on a shop switch); `scripts/screenshots.mjs` (the extra views for gate 3 in §13); `package.json` and the lock file; tests and documentation (§13, §14).
- **Keys are never removed, per theme**: the released-key list in `tests/collections.test.mjs` gains `cafe`: 24 keys, the 8 shared items included.

## 11. Adding a Theme with Its Own Colours

`docs/THEMES.md` changes as follows:

- **The existing themes**: the table gains a café row (`cafe`, 24 coffees and sweets, mascot Hot Coffee `hotcoffee`, all 24 in the demo (assumption 3c), its own dark colour scheme); the drawings the three themes share are listed clearly (Café shares 3 with Pastry shop and 7 with Bakery, Swiss Roll and Black Forest Cake being in all three); 67 drawings in all (a shared drawing counted once).
- **Drawing rules** gain two points: when a theme is dark, its drawings still get the usual dark outlines, because they always sit on a cream ground; the mascot is also drawn straight on the theme's page colour (opening animation, icons) and must be checked there too. A mascot may be marked with steam (`steam`), only a mascot and with exactly two wisps (assumption 31); if it is, tapping it and the opening animation move the steam by §3's rule, with no crumbs.
- The steps for **adding a theme** gain one more (optional) step, **"Your own colours"**:
  1. Write `background: '#RRGGBB'` in `THEMES` (the page's ground colour; the icons are drawn on it, and the browser bar uses it too).
  2. Add a `[data-theme="<id>"]` set to `app/app.css`, giving a value to every variable of the light set that changes with the theme (the variables of the table in §4.6 (b); copying the café set and editing it is easiest), plus `color-scheme`. For the theme to be in the demo too, add a set to `assets/style.css` as well (the shutter set is not needed), then add its wording and card pictures to `assets/app.js`.
  3. Run `npm test`: a missing variable, a text-and-ground pair (paired by variable name, §13) under 4.5:1, a focus ring or input border under 3:1, a `background` that differs from `--bg`, a hard-coded colour in a stylesheet — the tests name each one.
- **The file overview** gains `app/early-theme.js` and the colour test, and says that the colours live in `app/app.css`.
- 0.3's line "tapping the mascot spills crumbs in its outline colour" becomes "spills crumbs or, for a mascot marked with steam, steams".

## 12. Not in This Round

**(a) Listed in the decisions**:

- Dark mode for Pastry shop and Bakery; following the system's dark mode (Café is always dark, the other two always light).
- A theme chosen per person (still one theme per team).
- Changing the README screenshots to Café (they stay Pastry shop).

**(b) Proposed by this document as out of scope** (all assumptions; the maintainer can change them):

- The link-preview image (`assets/og.png`) and its text (assumption 35).
- The demo's confetti colours (assumption 14).
- Fixed text in the demo that mentions pastries, including the text of the "This is a demo" paragraph (assumption 34); that block's colours still change with the whole page.
- The footer's signature image (assumption 36).
- Web manifest colours per theme (assumption 19).
- Café's own "All {total} on the shelf" sentence (assumption 27).

**(c) Following from other decisions**:

- An animation for changing the theme in the app's Settings (already ruled out by the 0.3 design).
- The few places where Pastry shop's contrast is under 4.5:1 today (§1: Pastry shop does not change by one pixel).

## 13. Testing and Acceptance

Unit tests (`node --test`):

- **Colours** (new `tests/colours.test.mjs`): reads `app/app.css` and `assets/style.css` and runs for every `[data-theme="<id>"]` set (not just Café; the light set is not checked: Pastry shop and Bakery do not change by one pixel, and a few places fall short today):
  - **Complete**: the set gives every variable of the light set that changes with the theme (one left out would silently fall back to light). The shutter set, written separately in `:root`, does not count.
  - **Text ≥4.5:1**: paired by variable name, every stop computed when the ground is a gradient. The pairs are written in the test, independent of the theme, and cover the "Used for" column of §4.6 (b) in full, for example: `--ink` against `--bg`, `--page-art`, `--tile`, `--lamp-bg`, `--paper`, `--chosen`, `--field-bg`, `--key-bg`, `--warn-bg`, `--toast-bg`; `--holder-ink`, `--card-soft`, `--tile-label`, `--digit` against `--lamp-bg`; `--ink-soft` against `--bg`, `--page-art`, `--tile`, `--paper`, `--chosen`; `--accent` against `--bg`, `--page-art`, `--tile`, `--paper`, `--chosen`, `--warn-bg`; `--plus` against `--tile`, `--lamp-bg`; `--minus` against `--tile`, `--paper`, `--chosen`; `--bar-ink` against `--bar-bg`; `--primary-ink` against `--primary-bg`; `--confirm-ink` against `--confirm-bg`; `--pill-ink`, `--skip-ink`, `--bubble-ink` against their own grounds; `--warn-ink`, `--ok-ink`, `--bad-ink` against their own grounds; `--toast-ink`, `--toast-error-ink` against their own grounds; `--slot-ink` against `--slot-bg`; `--amount-zero` against `--tile`; `--wordmark` against `--tile`.
  - **Non-text ≥3:1**: `--focus` against `--bg`, `--page-art`, `--tile`, `--lamp-bg`, `--paper`, `--chosen`, `--field-bg`, `--warn-bg`, `--bar-bg`; `--field-border` against `--tile`, `--field-bg`, `--paper`, `--chosen`; `--frame` against `--tile`, `--chosen`, `--bg`; `--slot-border` against `--tile`, `--lamp-bg`.
  - For a theme with a `background`, `THEMES.<id>.background` equals its set's `--bg` (Café: `#160F0A`).
  - **No hard-coded colours**: outside custom property declarations, any colour literal (starting with `#`, `rgb()`/`rgba()`, `hsl()`, colour names) counts as hard-coded; `transparent`, `currentColor` and `inherit` do not (the tap highlight and the gaps between slots use `transparent`). The only ones allowed: the QR code's white ground `#fff` and the two `.dialog::backdrop` rules (§4.2).
- **Pastry shop and Bakery styles are equivalent** (a new static check): with the light set's variable values substituted into 0.4's `app/app.css` and `assets/style.css`, every 0.3.0 rule (pseudo-classes and pseudo-elements included) must compute the same declarations as in 0.3.0; rules new in 0.4 that also apply in light must either compute the same values as existing rules or be listed in the test with an explanation (for example `.theme-card`'s `color`). Rules that apply only under `[data-theme="cafe"]` are not counted. The dialog scrim rule is included.
- **Steam**: the step table is exactly §3's; the two wisps are 4 steps apart; at any step the cup's pixels are where they are in the whole drawing (centring uses the whole drawing); each wisp of `hotcoffee` has offsets exactly `[0,1,1,0]` (one of the gate 1 checks); the rule checks refuse a `steam` not in the palette, a steam area that is not 4 rows, a wisp missing a row, anything other than exactly 2 wisps, and `steam` on a drawing that is no theme's mascot (assumption 31).
- **Theme lists**: `cafe.json` matches `sprites.js` and holds exactly the 24 registered keys, the mascot first; `default.json` and `bakery.json` are unchanged; `forSlot` with no theme or with Pastry shop equals 0.2 (existing).
- **Collection**: a café team unlocks only from Café's 24 keys, in hash order, capped at 24; switching from Pastry shop to Café keeps the benefit icons `porttart`, `swissroll` and `blackforest` and removes the rest.
- **Icons**: Café's four files exist, and the PNGs' pixels equal the current mascot drawn on `#160F0A`; Pastry shop's and Bakery's icons are pixel-identical to 0.3; a café team gets the café icons. `tests/icons.test.mjs` lines 66–97 ("every theme except Pastry shop has four icon files" and the margin test) change to call `faviconSvg` and `iconPixels` with each theme's `background` (`#F2E7CE` when there is none), as `writeIcons` does.
- **Wording**: §7's 14 sentences and `label` and `card` match word for word; `THEMED_KEYS` is counted per theme (§7).
- **"A theme this version lacks" gets an id that will never ship**: existing tests use `cafe` as this example, and once Café ships they would fail or test the wrong thing (restore, opening and `recover-owner` would accept the database, and the page would draw Hot Coffee instead of the wife cake). They switch to `nosuchtheme` (already used this way at `tests/i18n.test.mjs` line 122): `tests/themes.test.mjs` (the UNKNOWN_THEME sentence pinned at line 15 now names this id, the list at line 41, the refusal tests at lines 69–73), `tests/db.test.mjs` lines 343–353, `tests/backup.test.mjs` lines 256–267, `tests/ops.test.mjs` lines 154–169, `tests/pixels.test.mjs` line 21 (`ODD_IDS`) and line 100, `tests/e2e/themes.spec.mjs` line 203. `tests/db.test.mjs` line 336 uses `cafe` only as a well-formed id and needs no change. The refusing code is unchanged and this id still exercises it; 0.3 refusing a café team is already pinned by 0.3.0's tests (§9), so no separate "0.3 copy" test is written. `docs/RELEASE-CHECKLIST.md` and `docs/VALIDATION.md` need no change for the id swap.

Browser tests (Playwright):

- **Pastry shop and Bakery do not change by one pixel**: with 0.3.0 (`5247e73`, checked out in a separate working directory), the same recording script records a baseline of "computed styles" — the colour-type properties (text, background, border colour and style, shadow, outline, `accent-color`) of every element on the member page, Team page, Settings page, sign-in page, setup page, keypad, dialogs, toasts, notices, badges, form errors and the demo — committed as test data; under the new code, Pastry shop and Bakery match it item for item (except the new café card and "Café" button). Elements are matched by a stable selector path (down from the nearest ancestor with an id or a landmark, by tag plus class plus position), not by text; for changing content such as dates only colour-type properties are recorded. Besides the elements themselves, `::before`, `::after` and `::backdrop` are recorded, as are the `:hover`, `:active`, `:focus-visible`, `:disabled` and `[aria-invalid]` states, forced through the DevTools protocol.
- **Canvases pixel by pixel** (new tests; today they only check that the balance canvas is drawn and changes after a spend, `tests/e2e/one-page.spec.mjs` lines 26–43, and the demo compares only the collection pictures): in Pastry shop and Bakery, each of the following canvases must equal a reference drawn on the same page with the same drawing function, the same size and `#4a2f1b`: the member page's balance (`pixelNumber`/`Pixel.drawNumber`, with reduced motion on so it draws in one go), "CRUMB" on the sign-in and setup pages (`pixelWord('CRUMB', 5)`), the demo's balance (`Pixel.drawNumber`, size 9) and the demo's "CRUMB" (`Pixel.drawText`, size 7); the demo's small downward chevron equals `CHEVRON` drawn in `#8a6a4c` (`Pixel.drawSprite`). In Café, the same canvases equal references drawn with the computed `--digit` and `--wordmark` (the chevron with `--chevron`), in the demo after a shop switch as well (§8: redrawn on every switch).
- **Every café text passes AA**: on the café member page, Team page (with the send-a-treat dialog open), Settings page, sign-in page, keypad, toasts, opening animation and demo, every visible text element is checked: take its colour and the first opaque ground behind it (every stop for a gradient), multiply in the `opacity` of the element and its ancestors, blend text and ground by the resulting alpha and then compute; every result must be ≥4.5:1. Disabled controls (`.btn:disabled`, a locked `.radio`, the demo's `.grant:disabled`, `.btn-confirm:disabled`) are explicitly exempt — WCAG 1.4.3 does not cover inactive controls; the moment of signing out (`.signing-out`) is skipped. The focus ring (≥3:1) is checked the same way, as is the computed border colour of every visible input and select (the language select included) against its actual ground (≥3:1).
- **No light flash**: open a café team's page once; on opening it again, delay the `/api/session` answer by two seconds, and during those two seconds check that `<html>` is already `cafe` and the page ground is dark. A new device (empty storage) turns dark as soon as the session arrives, and remembers it. After signing out the sign-in page is still dark; so it is when the follow-up question about who is signed in gets no answer. Switching to Café in Settings turns the page dark after saving without a full reload, and storage becomes `cafe`; switching back turns it light. With Café remembered on the device and no team set up on the server yet, the setup page is light. The static copy is always light. With device storage disabled (the test at `tests/e2e/product.spec.mjs` line 1040), a run on a café team too: the page still works.
- **Pages that read the theme themselves**: after the team is switched to Café in another tab, loading the Settings page or the member page turns `<html data-theme>` and `crumb.theme` into `cafe` (§4.1).
- **Steam**: tapping the café mascot spills no crumbs, and the canvas changes within about 1 second and then returns to the whole drawing; in the opening animation the steam moves; tapping the Pastry shop and Bakery mascots still spills crumbs in the outline colour (existing tests). With reduced motion, a tap leaves the canvas unchanged, and there is no opening animation.
- **Theme cards**: on the setup page the café card is dark and the other two light, and selecting Café does not darken the page; on a café team's Settings page the Pastry shop and Bakery cards are light, and stay light once locked (assumption 37); keyboard use and phone and desktop widths all work (the existing accessibility checks, with the third card added).
- **Demo**: three buttons; after switching to Café, the shelf, the mascot and its accessible name, the tab icon, the cabinet, the card pictures, the numbers (24, a single legend line) and §8's sentences are all Café's, and the console has no errors; the tour's second line comes from `TEXT` in all three shops; once §7's three sentences awaiting approval are approved, no visible text in the café contains "oven"; the colours change while the shutter is down, and the phone is already dark when it rolls up; the sign's text colour is the same in all three shops; with reduced motion, after a spend and after tapping the mascot in the café, the mascot canvas still equals the whole drawing; switching shops right after a bite starts in Pastry shop (or steam starts in the café), not one frame of the old shop's animation appears after the shutter rolls up (assumption 41); after a reload the shop is remembered, dark from the first paint, with no shutter; "Reset the demo" does not clear it; the tour starts from the beginning; with reduced motion the switch is instant and the colours change at the same moment; the three buttons stay within the page at phone width.
- **Security policy**: the existing "nothing triggers the CSP" check also runs on every café page.

Acceptance (each gate needs the maintainer's yes):

1. **Drawings**: the 15 new coffees plus the mascot, in two batches, each first shown to blind namers, with unrecognised ones fixed first; names are settled here (assumptions 29, 32). The first batch puts the mascot together with the items most easily confused: `hotcoffee`, `espresso`, `latte`, `cappuccino`, `icedcoffee`, `mocha`, `pourover`, `takeaway`; the second: `affogato`, `coldbrew`, `irishcoffee`, `macchiato`, `vietnamesedrip`, `frappe`, `espressotonic`, `dalgona`. The mascot is shown three ways: on a porcelain medallion (header size), on dark (opening animation size and tab icon size), plus the 8 steam steps in sequence. This gate also asks the maintainer to confirm each item's outline colour; the ")" shape check for `hotcoffee` (a unit test) must pass. Sentences that follow from the names are approved here too (assumption 33).
2. **New or changed README and documentation sentences**, together with §7's three demo sentences awaiting approval, as a PDF annotated in Chinese (for example "only two themes" becoming three; assumption 33).
3. **Screenshots**: the café member page, Team page, Settings page, sign-in page and keypad, with `node scripts/screenshots.mjs --theme cafe --all`. `--all` already captures the home-screen tip (`member-home-tip`) and the Settings lock notice today; `scripts/screenshots.mjs` must also capture (§10):
   - a fresh server with no team yet: the setup page with the café card selected (a dark card on a light page);
   - a second café team that has not sent a treat: the Settings page with all three cards selectable (light cards on a dark page); the sample team has sent treats, so its Settings page shows the locked look (assumption 37);
   - a sample benefit with an icon: in the member page and Team page lists, and in the Team page's icon-picker slots;
   - an uploaded sample logo: in the header, on the sign-in page, in the Settings preview;
   - a form error, a toast and an error toast, a control with a focus ring;
   - the three badge colours.

   The steam sequence belongs to gate 1 (screenshots turn animation off). The demo's three-shop switch: the demo is served locally from this branch and shown to the maintainer (assumption 42). The screenshots must show: the colours marked "design choice" in §4.6 — badges, notices, form errors, keypad, dialogs, toasts, focus ring, inputs, links, quiet buttons, prices, the caramel ring colour on the selected card's border, the sheet's top border and the intro text box's border, the logo's porcelain ground, the height of the page's lamp glow; the porcelain medallions and slot faces marked "design choice" in §2's table (the brand position on the sign-in page, the "next item" line, benefit icons, the icon picker, theme cards, the demo's person buttons and cards), with the maintainer asked to decide whether these places use porcelain or draw straight on dark; both card situations (the café card on the light setup page, and the light cards on the dark Settings page, both selectable and locked); the parts marked "design choice" in §8's demo table.

On top of that, the automated checks must all pass: every café text passes WCAG AA; no light flash on opening; Pastry shop and Bakery unchanged (pixel-identical where existing tests pin them, plus the new canvas and style checks above); no motion at all with reduced motion. Unit tests, browser tests and the process drill run from a fresh clone, with the results in `docs/VALIDATION.md` and anything not run marked "not verified". Version 0.4.0. Pushing, opening a PR and merging all wait for the maintainer's word.

## 14. Documentation

Every new or changed sentence goes through gate 2 first (the PDF annotated in Chinese) and is final only once approved.

- **`README.md`, `README.zh-CN.md`**: the version contents gain "what 0.4 includes" (the café theme, with its own candle-lit dark colour scheme); the upgrade note points to `OPERATIONS.md` "Upgrading from 0.3 to 0.4" (the docs test requires a link to the upgrade section of every release); the setup choices list three themes; "two themes" and "only two to choose from" become three; item and drawing counts (39, 24, 24; 67 drawings in all, a shared drawing counted once). The screenshots stay Pastry shop and are retaken once the version number changes, so the footer reads "Crumb 0.4.0".
- **`docs/THEMES.md`**: changes as in §11.
- **`docs/OPERATIONS.md`**: the opening list of upgrades gains 0.3 to 0.4, and that 0.1 and 0.2 can upgrade straight to 0.4; a new "Upgrading from 0.3 to 0.4" section: no migration runs, a backup shows `schema 3` both before and after, and the database does not change; from 0.1 or 0.2 straight to 0.4: migrations 002 and/or 003 run as in 0.3, existing teams land on Pastry shop (locked if they have sent a treat), and rolling back is only by restoring the pre-upgrade backup (§9); when rolling back to 0.3, Pastry shop and Bakery teams just switch back to the old image, and for café teams see §9; the "Unknown theme" section uses Café as its example; the section on changing the collection theme gains Café and "the whole page changes colour after saving", and next to the sentence saying other open pages change their icons only on their next load, it says the colours do the same (assumption 38); Café is always dark and does not follow the system setting.
- **`docs/DEPLOYMENT.md`**: three themes; what the browser stores grows from four items to five, adding the team theme `crumb.theme` (§5).
- **`CONTRIBUTING.md`**: after adding a theme or changing colours, run `npm test`; the colour test points out missing variables and insufficient contrast.
- **`docs/VALIDATION.md`, `docs/RELEASE-CHECKLIST.md`**: updated to 0.4.0 for this round; `VALIDATION.md` lists the existing migration tests in `tests/db.test.mjs` as covering the path "from 0.1 or 0.2 straight to 0.4".

## 15. Assumptions

These are points the decisions do not cover, which this document settles provisionally. Each one is for the maintainer to review; where the maintainer disagrees, it changes to the alternative given. The numbering follows the previous draft: split items are marked a, b, and new items are numbered from 30 on.

1. **16 new keys**: `hotcoffee`, `espresso`, `latte`, `cappuccino`, `mocha`, `macchiato`, `icedcoffee`, `coldbrew`, `affogato`, `irishcoffee`, `vietnamesedrip`, `pourover`, `takeaway`, `espressotonic`, `dalgona`, `frappe`. Never changed after release. Alternative: other spellings (for example `phin` for Vietnamese Drip, `caramelmacchiato` for Caramel Macchiato).
2. a. **English names capitalise every word** (Vietnamese Drip, Takeaway Coffee, Coffee Frappé), consistent with the existing names. Alternative: as written in the decision record (Vietnamese drip, Takeaway coffee, Coffee frappé).
   b. **Traditional Chinese names are the provisional ones in the table**. Alternative: settle them separately at the drawing gate.
3. a. **The rotation order** as in §2 (every three items, two coffees and one dessert; no two items of any of the three look-alike groups adjacent). Alternative: the 16 coffees first, then the 8 desserts; or some other order.
   b. **The pictures on the demo's cards** as in §8 (the first card Hot Coffee, Latte, Tiramisu). Alternative: other pictures.
   c. **All 24 café items are in the demo's rotation** (`limited` is empty, as for Bakery), and the cabinet and legend show a single line of 24. Alternative: keep a few items app-only, as Pastry shop does.
4. **How steam is marked**: the drawing names the steam character in a `steam` field, touching pixels form one wisp, and the steam area must be 4 rows. Alternative: a different character for each wisp, each listed separately.
5. **Tapping the mascot runs one steam cycle** (8 steps, 960 ms) and then returns to the whole drawing; tapping again starts over. Alternative: run until both wisps have fully dissipated (about 1.4 seconds).
6. **How the saucer shows on dark** is settled at gate 1. That the cup is drawn straight on dark in the opening animation, the tab icon and the home-screen icon is decided (§1, §2); the draft's saucer is a whole row of outline colour and nearly invisible on dark, so while drawing, for example, the saucer row becomes a slightly lighter colour, or the saucer gets a light outline. Alternative (this would change a decision): put a cream medallion under it in those places.
7. **The header's porcelain ground is round, as in the mock-up**; if the cup's saucer would stick out of the circle, it becomes a rounded square like the slots, reviewed at gate 3. Alternative: rounded squares everywhere.
8. **The parts outside the phone change colour at the swap, in one step.** The whole demo page changing colour is decided (§1); the roller shutter is only in the phone, so the parts outside the phone go from light to dark (or back) in one step at the swap (about 383 ms), in plain view, with nothing covering them; this assumption accepts that moment. Other option: a very short colour transition outside the phone (none with reduced motion).
9. a. **The shutter and sign are the same for all three shops** (variables used only by the shutter). Alternative: the shutter and sign change colour with the shop (the theme would then have to change before the new shop's name is drawn).
   b. **The sign reads "CAFE"**. Alternative: add an "É" to the pixel font.
10. **The demo's "bite" after a spend becomes steam in the café**. Alternative: bite and spill crumbs as before.
11. **The app icon at the top of the demo's list has a dark ground in the café**, like the home-screen icon. Alternative: a porcelain ground, like the collection slots.
12. **The demo's "next item" line uses the app's approved "{name} is coming right up"**. Alternative: keep "is in the oven" for now, pending a separate approval.
13. **The demo's three sentences awaiting approval** (opening animation, notice after a treat, the tour's second line) **use the current sentences until they are approved**. Alternative: no merge until they are approved.
14. **The demo's confetti colours do not change** (the golds read on dark as well). Alternative: a separate set for Café.
15. **Signing out does not delete the theme remembered on the device** (it belongs to the team, not to a person). Alternative: delete it on sign-out (the next open would flash light first).
16. **A new device opening for the first time, or a device that remembers a light theme while the team has switched to Café on another device, shows a light "Loading" moment**. Alternative: have the server answer that small script according to the team's theme, so these two cases do not flash either (one more address answered by team theme, as the icons are).
17. **When the remembered theme differs from the team's actual one, the page draws the remembered one first and changes as soon as the session arrives**. Alternative: until the session arrives, draw only the "Loading" line and nothing else in the remembered theme (no flash in this rare case either, but every open would wait for the session before showing the page).
18. **`<meta name="theme-color">` is added for Café only**, so the phone's browser bar is dark too. Alternative: none, and the browser bar keeps the system default.
19. **The web manifest does not change per theme** (`"display": "browser"` does not use its colours). Alternative: the server answers it by team theme, as with the icons.
20. **The team logo sits on porcelain in Café**: today's rounded square (8px radius in the header; 18px, scaled, on the sign-in page), filled with the porcelain gradient instead of `--tile`, with a little padding, and `object-fit: contain` unchanged; the Settings preview the same. The medallion is only for the mascot and single pictures. Alternative: straight on dark.
21. **Lines between list rows are solid in Café** (§4.6's `.rec`, `.row`, `.check-list li`, `.quest-month`, and the demo's `.rec`, `.recent-row`, `.quest-month`), while dividers between sections (`.menu-nav`, `fieldset.group`, `.auth-foot`, and the demo's `.stats`, `.nudge`, footer) stay dashed. Alternative: only the log is solid; or every dashed line becomes solid.
22. **The demo's café uses the same colours as the app** (parts only the demo has are in §8's table). Alternative: the demo gets its own palette.
23. **The static copy is always light** (`noServer()` removes `data-theme`). Alternative: draw what the device remembers.
24. **Café's focus ring and input borders must reach 3:1** (the decisions only require text to pass AA; these two are so they can be seen on dark). Alternative: check text only.
25. **Café's keypad amount at 0 also passes 4.5:1** (using the secondary text colour), although Pastry shop's does not. Alternative: a paler grey, as in Pastry shop (which would not satisfy "every text passes AA").
26. **The new field in `THEMES` is called `background`**, and it is not in the list file. Alternative: call it `colours` and hold more colours.
27. **Café uses the base "All {total} on the shelf" sentence (`me.complete`)**. Alternative: a separate sentence for Café (needs approval).
28. **Only the mascot's steam moves**; other coffees drawn with steam do not. Alternative: every hot coffee moves (several slots on the shelf moving at once would be busy).
29. **The two drawing batches** are split as in §13. Alternative: the first 8 and the last 8 in rotation order.
30. **The left wisp goes first**: when the animation starts, the left wisp is at step 0 and the right one at step 4. Alternative: the right wisp goes first.
31. **Steam is marked only on a mascot, with exactly two wisps**: the rule checks report an error for `steam` that is not exactly 2 wisps, or that is on a drawing that is no theme's mascot. When the same drawing is an ordinary item in another theme, its steam shows in full and does not move. Alternative: go by the number of wisps n, wisp k starting at step k×8/n; `steam` on a drawing that is not a mascot is just ignored, with no error.
32. **The blind-naming pass mark**: at least two independent namers per drawing, not told beforehand what this round is drawing; recognised = saying the item's name or a clear synonym (just "coffee" for Cold Brew does not count); if any one namer fails to recognise it, the drawing is fixed first. Alternative: recognition by a majority passes; or a different number of namers.
33. **At which gate sentences awaiting approval are approved**: the demo's three sentences go into gate 2's PDF with the documentation sentences; sentences that follow from names (the mascot's accessible name "Mascot: …", the card's "“Latte is coming right up”") are approved at gate 1 together with the names. Alternative: these sentences get a separate approval of their own.
34. **Fixed text in the demo that mentions pastries stays as is in the café**: the summary at the top ("unlocks a pixel pastry"), the "This is a demo" paragraph (which says "The bakery team"), the "🍞 Spend some credit" button, the daily lines `DAILY` and `DAILY_ZERO` (with their 🥐🍞🥖🍰🥯🧈), and the empty-log line ("…when you take something 🍞"). Their colours still change with the page. Alternative: write café versions, each needing approval.
35. **The link-preview image `assets/og.png` and its text do not change** (the og and twitter image descriptions say "twelve pixel pastries"): there is only one link preview, and it does not follow the shop a visitor picks. Alternative: make a preview image that includes Café, with its text changed to match (needs approval).
36. **The footer's signature image stays as it is** (it has its own cream ground) and is a cream plaque on the dark page. Alternative: make a separate one for dark pages, or give it a frame.
37. **How disabled and locked look in Café**: disabled buttons fade through opacity as in 0.3 (for example, when the keypad has just opened, the confirm key is a half-transparent honey over the dark sheet); a locked theme card inside a café page fades only its contents (0.65), while its ground keeps its own theme's colour, so the Pastry shop and Bakery cards stay light when locked; inside Pastry shop and Bakery pages the whole card fades as in 0.3, unchanged. Alternative: in Café too, the whole card fades as in 0.3 (a locked light card becomes a greyish-brown in-between colour and no longer "stays light"); or a separate set of `--disabled-*` colours.
38. **Other pages already open change colour only on their next load** (for example the Team page in another tab), as 0.3's icons do; the Settings and member pages change whenever they get their data (§4.1). Alternative: every page checks the session on a timer.
39. **Under forced colours (`forced-colors: active`), in Café only, the balance digits and "CRUMB" use the system text colour (`CanvasText`)**: the page ground is replaced by a system colour (white under a light high-contrast theme), and cream digits on the canvas would be invisible. Pastry shop and Bakery as in 0.3. Alternative: change this for every theme (Pastry shop and Bakery would change); or for none.
40. **When a café page opens, the phone's browser bar is the default colour at first and turns dark when the session arrives**; `early-theme.js` only sets `data-theme` and does not touch the browser bar. When the tag is removed, the browser bar returns to the default. Alternative: `applyTheme` also records a colour next to `crumb.theme` (`early-theme.js` does not know the list of themes, so it cannot know the colour by itself), and `early-theme.js` inserts a `theme-color` tag right at the start.
41. **A demo shop switch first cancels any bite or steam in progress, then redraws**; every steam loop stops when it finds its canvas no longer in the page; whether a cycle is steam or a bite is decided once, when it starts. In 0.3, switching mid-bite goes on biting the new shop's mascot; this changes for all three shops. Alternative: cancel only when switching into or out of Café, and keep 0.3's behaviour between Pastry shop and Bakery.
42. **For gate 3, the demo's three-shop switch is served locally from this branch and shown to the maintainer**: the public demo (GitHub Pages) only updates after merging, and merging waits for the maintainer's word. Alternative: push to a preview address first (needs the maintainer's agreement to push).
