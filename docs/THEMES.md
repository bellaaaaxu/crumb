# Collectibles and themes

A **collection theme** is a set of pixel collectibles that people unlock with the treats they
receive, together with a mascot and a name. Each team uses one. The owner picks it when setting
up Crumb and can change it in Settings until the first treat; after that it is fixed, together
with the unlock step (see
[Changing the collection theme](OPERATIONS.md#changing-the-collection-theme)). The rules for
earning collectibles are the same in every theme; only the pictures, the mascot, a few
sentences and, for a theme with colours of its own, the colours change.

This page has three parts: the three themes Crumb ships, the drawing rules, and how to add a
theme of your own. The reference after them — the files, the list format, keys, the unlock
order and benefit icons — applies to every theme.

## The three themes

| Theme | Id | Items | Mascot | Colours | Public demo |
| --- | --- | --- | --- | --- | --- |
| Pastry shop | `default` | 39 pastries | Wife Cake (`laopo`) | light | 33 in its rotation; the other 6 only in the self-hosted app |
| Bakery | `bakery` | 24 breads and cakes | Bitten Toast (`toastbite`) | light | all 24 |
| Café | `cafe` | 24 coffees and sweets | Hot Coffee (`hotcoffee`) | its own, always dark | all 24 |

A new team is on the Pastry shop unless its owner picks another theme, and a team upgraded
from 0.2 is on the Pastry shop.

An item two themes share has the same key and the same picture in both, and is drawn once, in
`assets/sprites.js`: 67 drawings in all.

- The Pastry shop and the Bakery share 12: `bolo`, `boloyau`, `gaimei`, `sausage`,
  `creambun`, `cheesehotdog`, `caketriangle`, `blackforest`, `mango`, `swissroll`, `papercake`
  and `chestnut`.
- The Café shares 3 with the Pastry shop — `porttart`, `swissroll` and `blackforest` — and 7
  with the Bakery: `tiramisu`, `madeleine`, `croissant`, `cinnamonroll`, `swissroll`,
  `blackforest` and `strawberrycake`. So `swissroll` and `blackforest` are in all three. Its
  16 coffees are its own.

## Drawing rules

Every drawing keeps to the [format](#a-sprite) below and to the style of the existing ones:

- Flat fills.
- 3 to 5 colours, the outline included.
- No faces.
- The outline, `X`, is a dark shade of the item's main colour. Baked, brown things use a dark
  brown (the most common is `#7A4A1E`); things that are not brown use a darker shade of their
  own colour (taro `#6E4E86`, mochi `#6B7F3E`); pale, white or cream things use a darker shade
  of that pale colour (the almond stick, nougat and turnip cake share `#A98963`). Coffee, and
  the Café's white china cups with it, take a dark brown; a clear glass takes a darker shade
  of the drink inside it.
- Shapes stay distinct from one another. No more triangle cakes.
- Look at it at every size it is drawn — on the shelf, and for a mascot in the header and the
  oven intro — before calling it done: one that cannot be recognised small needs simplifying
  or replacing.
- A dark theme's items get the usual dark outlines too: its shelf gives them a cream ground,
  as the Café's porcelain slots do.
- A mascot is also drawn straight on its theme's page colour, in the oven intro and as the tab
  and home-screen icons: look at it there as well.
- A mascot may have **steam**: its sprite names the palette symbol the steam is drawn with,
  `steam: 's'`. Only a theme's mascot may have it, and it is exactly two wisps, each with a
  cell in each of the same 4 rows. Tapping the mascot then makes it steam, with no crumbs, and
  so does the oven intro while it shows: each wisp appears row by row from the bottom and fades
  away from the bottom again, never moving sideways, 8 steps of 120 ms a round, the two wisps
  half a round apart. Everywhere else the steam stands still, shown in full, and so it does
  in a theme where the same drawing is an ordinary item. `npm run themes` checks these rules.

## Adding a theme

A theme's drawings, their names and its entry in `THEMES` are all in
[`assets/sprites.js`](../assets/sprites.js); a theme with colours of its own also has a group in
the stylesheets (step 5). This is the Bakery's entry:

```js
bakery: {
  mascot: 'toastbite',
  rotation: ['toastbite', 'croissant', 'bolo', /* … 24 keys in all */],
  limited: [],
  version: 1,
  label: { en: 'Bakery', 'zh-CN': '面包店' },
  card: { en: 'Bakery · {count} breads and cakes', 'zh-CN': '面包店 · {count} 款面包和蛋糕' },
},
```

- `mascot`: one of the theme's items. It is drawn in the header (when there is no logo), in the
  oven intro and on the sign-in and setup pages, it is the tab icon and the home-screen icon,
  and tapping it spills crumbs in its outline colour or, for a mascot with steam, makes it steam.
- `rotation`: the items the public demo rotates through, in order (every item except the
  `limited` ones). The setup and Settings cards draw its first three, so put the mascot first.
- `limited`: items that can only be earned in the self-hosted app, never in the public demo;
  usually none.
- `version`: 1 for a new theme. Raise it by one whenever the theme gains a key.
- `label` and `card`: the theme's name, and the line under its card, in English (`en`) and
  Simplified Chinese (`zh-CN`). Write the number of items as `{count}`: Crumb counts the list.
  Never type the number.
- `background` (optional): the page colour of a theme with colours of its own; see step 5.

The key (`bakery`) is the theme's id. It names the theme's list file, its icon folder and its
wording keys: 2 to 32 lowercase letters and digits, starting with a letter (`npm run themes`
refuses any other).

To add a theme:

1. **Draw and list it in `assets/sprites.js`.** Draw each new item into `SPRITES` by the
   drawing rules, and give it English, Traditional Chinese and Simplified Chinese names in
   `NAMES` (`en`, `zh`, `cn`). An item another theme already has is not drawn again: list its
   key. Then add the theme's entry to `THEMES`.
2. **Run `npm run themes`.** It writes `themes/<id>.json` and the theme's icons,
   `app/icons/<id>/favicon.svg` with `icon-180.png`, `icon-192.png` and `icon-512.png` beside
   it. It stops at the first rule a theme breaks: a theme id of any other shape, a drawing
   outside the [format](#a-sprite), a listed key with no drawing in `SPRITES`, a drawing that
   belongs to no theme, a key twice in one theme or in both its `rotation` and its `limited`, a
   mascot outside its own `rotation`, a missing name, `label` or `card`, a `card` without
   `{count}` or with a digit in it, a `version` that is not a positive whole number, a
   `background` that is not `#RRGGBB`, steam that breaks the drawing rules, or the id
   `nosuchtheme`, which the tests keep for a theme that never ships.
3. **Register the new keys.** In [`tests/collections.test.mjs`](../tests/collections.test.mjs),
   add an entry for the theme to the released-key list, with every key of the theme, shared
   ones included. Then run `npm test`. If step 2 was skipped, or the mascot changed without a
   rerun, the tests fail.
4. **(Optional) Your own wording.** A few sentences talk about the collection; their base keys
   are listed in `THEMED_KEYS` in [`app/i18n.js`](../app/i18n.js). A theme uses the Pastry
   shop's sentences unless both [`app/locales/en.js`](../app/locales/en.js) and
   [`app/locales/zh-CN.js`](../app/locales/zh-CN.js) have its own, keyed
   `<base key>.<theme id>` with the same placeholders as the base key, as the Bakery's
   `grant.unlocked.bakery` is.
5. **(Optional) Your own colours.** A theme is light, like the Pastry shop and the Bakery,
   unless it has colours of its own, as the Café does:
   1. In its `THEMES` entry, write `background: '#RRGGBB'`, the page's ground colour. Its
      icons are drawn on it (a theme without one has them on cream, `#F2E7CE`), and a phone's
      browser bar takes it. Then run `npm run themes` again: it redraws the icons on that
      colour, and the tests fail until it has.
   2. In [`app/app.css`](../app/app.css), add a `[data-theme="<id>"]` group that gives every
      variable of the light group (`:root, [data-theme]`) a value, with its `color-scheme`;
      copying the Café's group and changing it is easiest. Its `--bg` is the colour of
      `background`. Add the same kind of group to [`assets/style.css`](../assets/style.css),
      the public demo's, even while the demo does not show the theme: the tests ask both
      stylesheets for a group for every theme with a `background`. The shutter's own `:root`
      group there stays as it is. A dark theme also copies the Café's own rules that follow
      its group, with its id in place of `cafe`: in `app/app.css`, a darker backdrop behind
      dialogs, a locked theme card that keeps its own ground and, under forced colours (a
      high-contrast mode), the balance and `CRUMB` in the system's text colour; in
      `assets/style.css`, that forced-colours rule.
      [`tests/colours.test.mjs`](../tests/colours.test.mjs) lists these rules one by one and
      fails on any other, so add each copy there too: the backdrop's colour to the colours
      that `STYLESHEETS` lets `app/app.css` write out, and every copied rule to the list in the
      test of its stylesheet whose name says the café "is always dark".
   3. Run `npm test`. [`tests/colours.test.mjs`](../tests/colours.test.mjs) names every
      variable the group leaves out, every text that stands out from its ground by less than
      4.5:1 (the test pairs each text colour with the grounds it is used on, by variable name),
      every focus ring or input border under 3:1, a `background` with no group in one of the
      two stylesheets or not the same colour as the group's `--bg`, and any colour written
      straight into a rule instead of a variable.

   The page takes the colours from the theme's id on `<html data-theme>`.
   [`app/early-theme.js`](../app/early-theme.js) puts the id the browser remembers there before
   the first paint, so the page does not flash light; it knows no list of themes and needs no
   change.

In the pull request, include screenshots of the new drawings on the shelf and of the mascot in
the header, and say how the drawings were made.

The public demo shows a theme once it has its button in the switch in
[`index.html`](../index.html) and, in [`assets/app.js`](../assets/app.js), its wording in `TEXT`
and the pictures on its cards in `CARD_ICONS`.

## Where it lives

| File | Role |
| --- | --- |
| [`assets/sprites.js`](../assets/sprites.js) | The source of every theme: each drawing's palette and rows (`SPRITES`), each item's names (`NAMES`) and each theme's entry (`THEMES`). The public demo, the self-hosted app, the link-preview card and the home-screen icons all draw from this one table. |
| [`themes/default.json`](../themes/default.json), [`themes/bakery.json`](../themes/bakery.json), [`themes/cafe.json`](../themes/cafe.json) | One list per theme, which the server unlocks from and names collectibles with; `server/themes.mjs` reads them all at start. Generated — do not edit by hand. |
| [`app/icons/bakery/`](../app/icons/bakery/favicon.svg), [`app/icons/cafe/`](../app/icons/cafe/favicon.svg) | A theme's tab icon (`favicon.svg`) and home-screen icons (`icon-180.png`, `icon-192.png`, `icon-512.png`), drawn from its mascot on its `background`, or on cream without one; one folder per theme. Generated. The Pastry shop's are `app/favicon.svg`, drawn by hand, and the generated `app/icons/icon-180.png`, `icon-192.png` and `icon-512.png`. |
| [`app/app.css`](../app/app.css), [`assets/style.css`](../assets/style.css) | The colours, as variables: the light group (`:root, [data-theme]`), which the Pastry shop and the Bakery use, and a `[data-theme="<id>"]` group for each theme with colours of its own. `assets/style.css` is the public demo's, with one more `:root` group for its shutter, the same in every shop. |
| [`app/early-theme.js`](../app/early-theme.js) | Puts the team's theme the browser remembers (`crumb.theme`) on `<html data-theme>` before the first paint, so a dark theme does not flash light while the page loads. The public demo has its own, `assets/early-shop.js`. |
| [`tests/colours.test.mjs`](../tests/colours.test.mjs) | Checks every theme's colour group: every variable given, text and grounds at least 4.5:1, focus rings and input borders at least 3:1, `background` the same colour as `--bg`, and no colour written into a rule. |
| [`scripts/theme-manifest.mjs`](../scripts/theme-manifest.mjs) | Checks every drawing and every theme, and writes the lists. It holds no theme data. |
| [`scripts/make-icons.mjs`](../scripts/make-icons.mjs) | Draws the icons. `npm run themes` runs this script after the one above. |

## The list file

```json
{
  "themeId": "default",
  "version": 1,
  "source": "assets/sprites.js",
  "mascot": "laopo",
  "keys": ["laopo", "tart", "…"],
  "names": {
    "laopo": { "en": "Wife Cake", "zh-Hant": "老婆餅", "zh-CN": "老婆饼" }
  }
}
```

`keys` lists every collectible of the theme: its `rotation`, then its `limited`. `names` gives
each one an English, Traditional Chinese and Simplified Chinese name; the app shows the one
matching the person's language. `mascot` is the theme's mascot. A theme's `background` is not
in its list file.

## A sprite

```js
laopo: { palette: { X: '#5C3A1D', b: '#E0A73C', a: '#F3D488', s: '#8A5A22' }, rows: [
  '....XXXX....',
  '..XXbbbbXX..',
  // …12 rows in all
] },
```

- Exactly **12 rows of 12 characters**.
- `.` is transparent. Every other character must be a key of `palette`.
- Palette keys are single characters; colours are `#RRGGBB`.
- At least one cell must be painted.

Each cell is drawn as a square — 3 CSS pixels on the shelf, 2 in the "next on your shelf"
hint, larger in the demo — scaled for the screen's pixel density and never smoothed. A
drawing is centred by its painted cells, so a flat sprite and a round one sit level in the
same slot.

## Keys are forever, in every theme

When someone unlocks a collectible, Crumb stores its key in their record permanently, and
looks up its names and the size of the shelf in their team's theme list. So:

- **Never remove, rename or reuse a key** once a release has shipped it in a theme. The
  released-key list in [`tests/collections.test.mjs`](../tests/collections.test.mjs) has an
  entry per theme, and the tests fail if a theme's list loses a key, gains one that is not
  registered, or has no entry.
- A key in several themes is registered under each and stays in each: dropping it from one
  fails even while the others still have it, because the first theme's members may hold it.
- Nor is a theme ever removed once released: a database whose team uses it would no longer
  open ([Unknown theme](OPERATIONS.md#unknown-theme)).
- Keys are 2 to 32 lowercase letters and digits, starting with a letter.
- Redrawing a sprite is fine if it stays recognisably the same thing; turning `tart` into a
  cookie is not. A shared drawing changes in every theme that lists it.

## The order people unlock them in

Each person's shelf fills in a fixed order of its own: the keys of their team's theme, sorted
by `SHA-256(userId + ":" + key)`. The same person sees the same order on every device and
after every restart; two people rarely share one. The order a theme lists its keys in does not
change it. Unlocked collectibles are stored with their position, so adding keys later never
changes anything someone already has — new keys simply take their places among the positions
not yet unlocked.

Unlocking counts **treats received** (grants minus revokes; a treat to several people counts
for each of them on its own). Every time it passes another multiple of the organization's
unlock step, the next collectible in that person's order unlocks. Spending — self-recorded
entries and their corrections included — refunds and revokes never remove one. When every key
of the theme is unlocked, the person's page says the collection is complete, and treats keep
counting as usual.

Adding keys also catches people up. Someone whose treats had earned more collectibles than
the theme had — a complete shelf with steps to spare — gets the new ones on their next treat,
possibly several at once.

## Benefit icons

A benefit may carry one collectible as its icon: one key, stored in `rewards.icon_key`, or
none. The server accepts only a key of the team's theme and refuses anything else; the Team
page offers exactly those keys, named in the interface's language from the theme list's
`names`. This is the second reason a key must never be removed from a theme: a benefit may
still point at it.

Changing the theme before the first treat removes, in the same write, the icon of every
benefit (active or not) whose key the new theme does not have, and Settings says how many were
removed; icons the old and the new theme share are kept.

## Adding a collectible to a theme

1. In `assets/sprites.js`, draw it into `SPRITES`, give it its three names in `NAMES`, add its
   key to the theme's `rotation` (or `limited`, for the self-hosted app only) and raise the
   theme's `version` by one. The Pastry shop's `rotation` and `limited` are `CYCLE` and
   `LIMITED`, so its keys go there. To add an item another theme already has, only add its
   key.
2. Run `npm run themes`, add the key to that theme's entry in the released-key list in
   `tests/collections.test.mjs`, and run `npm test`.
3. Include before-and-after screenshots of the shelf in the pull request.

Pixel-art contributions are welcome. Please keep to the drawing rules above, and say how the
drawing was made.
