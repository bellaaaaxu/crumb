# Collectibles and themes

A **collection theme** is a set of pixel collectibles that people unlock with the treats they
receive, together with a mascot and a name. Each team uses one. The owner picks it when setting
up Crumb and can change it in Settings until the first treat; after that it is fixed, together
with the unlock step (see
[Changing the collection theme](OPERATIONS.md#changing-the-collection-theme)). The rules for
earning collectibles are the same in every theme; only the pictures, the mascot and a few
sentences change.

This page has three parts: the two themes Crumb ships, the drawing rules, and how to add a
theme of your own. The reference after them — the files, the list format, keys, the unlock
order and benefit icons — applies to every theme.

## The two themes

| Theme | Id | Items | Mascot | Public demo |
| --- | --- | --- | --- | --- |
| Pastry shop | `default` | 39 pastries | Wife Cake (`laopo`) | 33 in its rotation; the other 6 only in the self-hosted app |
| Bakery | `bakery` | 24 breads and cakes | Bitten Toast (`toastbite`) | all 24 |

A new team is on the Pastry shop unless its owner picks another theme, and a team upgraded
from 0.2 is on the Pastry shop.

The two themes share 12 drawings, with the same key and the same picture: `bolo`, `boloyau`,
`gaimei`, `sausage`, `creambun`, `cheesehotdog`, `caketriangle`, `blackforest`, `mango`,
`swissroll`, `papercake` and `chestnut`. Each is drawn once, in `assets/sprites.js`.

## Drawing rules

Every drawing keeps to the [format](#a-sprite) below and to the style of the existing ones:

- Flat fills.
- 3 to 5 colours, the outline included.
- No faces.
- The outline, `X`, is a dark shade of the item's main colour. Baked, brown things use a dark
  brown (the most common is `#7A4A1E`); things that are not brown use a darker shade of their
  own colour (taro `#6E4E86`, mochi `#6B7F3E`); pale, white or cream things use a darker shade
  of that pale colour (the almond stick, nougat and turnip cake share `#A98963`).
- Shapes stay distinct from one another. No more triangle cakes.
- Look at it at every size it is drawn — on the shelf, and for a mascot in the header and the
  oven intro — before calling it done: one that cannot be recognised small needs simplifying
  or replacing.

## Adding a theme

Everything about a theme is in [`assets/sprites.js`](../assets/sprites.js): its drawings,
their names and its entry in `THEMES`. This is the Bakery's entry:

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
  and tapping it spills crumbs in its outline colour.
- `rotation`: the items the public demo rotates through, in order (every item except the
  `limited` ones). The setup and Settings cards draw its first three, so put the mascot first.
- `limited`: items that can only be earned in the self-hosted app, never in the public demo;
  usually none.
- `version`: 1 for a new theme. Raise it by one whenever the theme gains a key.
- `label` and `card`: the theme's name, and the line under its card, in English (`en`) and
  Simplified Chinese (`zh-CN`). Write the number of items as `{count}`: Crumb counts the list.
  Never type the number.

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
   `{count}` or with a digit in it, or a `version` that is not a positive whole number.
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

In the pull request, include screenshots of the new drawings on the shelf and of the mascot in
the header, and say how the drawings were made.

## Where it lives

| File | Role |
| --- | --- |
| [`assets/sprites.js`](../assets/sprites.js) | The source of every theme: each drawing's palette and rows (`SPRITES`), each item's names (`NAMES`) and each theme's entry (`THEMES`). The public demo, the self-hosted app, the link-preview card and the home-screen icons all draw from this one table. |
| [`themes/default.json`](../themes/default.json), [`themes/bakery.json`](../themes/bakery.json) | One list per theme, which the server unlocks from and names collectibles with; `server/themes.mjs` reads them all at start. Generated — do not edit by hand. |
| [`app/icons/bakery/`](../app/icons/bakery/favicon.svg) | A theme's tab icon (`favicon.svg`) and home-screen icons (`icon-180.png`, `icon-192.png`, `icon-512.png`), drawn from its mascot; one folder per theme. Generated. The Pastry shop's are `app/favicon.svg`, drawn by hand, and the generated `app/icons/icon-180.png`, `icon-192.png` and `icon-512.png`. |
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
matching the person's language. `mascot` is the theme's mascot.

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
- A key in two themes is registered under both and stays in both: dropping it from one fails
  even while the other still has it, because the first theme's members may hold it.
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
removed; icons the two themes share are kept.

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
