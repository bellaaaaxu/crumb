# Collectibles and themes

A **theme** is the set of pixel collectibles people unlock with recognition. Version 0.1 of
Crumb has exactly one: the default theme of 39 pastries. There is no theme switcher yet, and
this page does not describe one — it describes how the default theme is built and the rules
anyone changing it must keep.

## Where it lives

| File | Role |
| --- | --- |
| [`assets/sprites.js`](../assets/sprites.js) | The drawings: every sprite's palette and rows, plus English and Chinese names. The public demo, the self-hosted app and the link-preview card all draw from this one table. |
| [`themes/default.json`](../themes/default.json) | The manifest the server unlocks from: `themeId`, `version`, `keys` and `names`. Generated — do not edit by hand. |
| [`scripts/theme-manifest.mjs`](../scripts/theme-manifest.mjs) | Checks every sprite and writes the manifest. Also holds the Simplified Chinese names. |

## The manifest

```json
{
  "themeId": "default",
  "version": 1,
  "source": "assets/sprites.js",
  "keys": ["laopo", "tart", "…"],
  "names": {
    "laopo": { "en": "Wife Cake", "zh-Hant": "老婆餅", "zh-CN": "老婆饼" }
  }
}
```

`keys` lists every collectible. `names` gives each one an English, Traditional Chinese and
Simplified Chinese name; the app shows the one matching the person's language.

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

## Keys are forever

When someone unlocks a collectible, Crumb stores its key in their record permanently. So:

- **Never remove, rename or reuse a key** once a release has shipped it. The tests keep a
  list of released keys and fail if one disappears.
- Keys are 2 to 32 lowercase letters and digits, starting with a letter.
- Redrawing a sprite is fine if it stays recognisably the same thing; turning `tart` into a
  cookie is not.

## The order people unlock them in

Each person's shelf fills in a fixed order of its own: the keys sorted by
`SHA-256(userId + ":" + key)`. The same person sees the same order on every device and after
every restart; two people rarely share one. Unlocked collectibles are stored with their
position, so adding keys later never changes anything someone already has — new keys simply
take their places among the positions not yet unlocked.

Unlocking counts **recognition received** (grants minus revokes). Every time it passes
another multiple of the organization's unlock step, the next collectible in that person's
order unlocks. Spending, refunds and revokes never remove one. When every key is unlocked,
My Crumb says the collection is complete, and recognition keeps counting as usual.

## Adding a collectible to the default theme

1. In `assets/sprites.js`, add the drawing to `SPRITES`, its names to `NAMES` (`en` and
   Traditional Chinese `zh`), and its key to `CYCLE` (which also puts it in the public demo's
   rotation) or `LIMITED` (self-hosted app only).
2. In `scripts/theme-manifest.mjs`, add its Simplified Chinese name to `SIMPLIFIED` and raise
   `THEME_VERSION` by one.
3. Run `node scripts/theme-manifest.mjs`, then `npm test`. Add the new key to the released-key
   list in `tests/collections.test.mjs` in the same pull request.
4. Include before-and-after screenshots of the shelf in the pull request.

Pixel-art contributions are welcome. Please keep to the existing palette style and grid, and
say how the drawing was made.
