/* The pixel art comes from /assets/sprites.js, the same table the public demo
 * draws from. This module is the only place that touches it.
 *
 * sprites.js declares `const Pixel` in a classic script. That makes a global
 * *lexical* binding, not a property of window, so `globalThis.Pixel` is
 * undefined — but a module can still reach it by its bare name.
 *
 * Drawing happens here, and so does what a collection theme looks like
 * (Pixel.THEMES): its mascot, its name and card text, its icon files. Which
 * collectibles a team has and what they are called still come from the
 * server's theme list, in each language the interface has. */

const table = typeof Pixel === 'undefined' ? null : Pixel; // eslint-disable-line no-undef

/* Pastry shop: the theme every team had before there were themes, and the one an id this
 * page does not know falls back to. */
const DEFAULT_THEME = 'default';
/* The wife cake's outline: the crumbs' colour when a drawing has none to give. */
const FALLBACK_OUTLINE = '#5C3A1D';

function canvas() {
  const node = document.createElement('canvas');
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/* Draws one collectible. Returns false when the key is not in the table. */
export function drawCollection(target, spriteKey, size = 3) {
  const sprite = table?.SPRITES?.[spriteKey];
  if (!sprite) return false;
  table.drawSprite(target, sprite, size, 0);
  return true;
}

/* An undrawn canvas would fall back to 300×150 and push the layout apart, so it is hidden. */
export function spriteCanvas(spriteKey, size = 3) {
  const node = canvas();
  if (!drawCollection(node, spriteKey, size)) node.hidden = true;
  return node;
}

/* Capitals, digits, space, dot and dash only — the 3x5 font has nothing else. */
export function pixelWord(text, size, color) {
  const node = canvas();
  if (table) table.drawText(node, text, size, color);
  else node.hidden = true;
  return node;
}

/* Digits, dot and dash only, drawn on a canvas the caller keeps: the rolling balance
 * repaints the same one many times a second. */
export function pixelNumber(target, text, size, color) {
  if (table) table.drawNumber(target, text, size, color);
  else target.hidden = true;
}

/* ---------------------------------------------------------------- collection themes */

/* The id itself when the table has a theme by that name, otherwise Pastry shop's. Only the
 * table's own entries count: "constructor" or "toString", names every object answers to, are
 * as unknown as a theme from a newer Crumb, and none of them throws. */
function knownTheme(id) {
  return typeof id === 'string' && table?.THEMES && Object.hasOwn(table.THEMES, id) ? id : DEFAULT_THEME;
}

/* Every theme the table has, in its order (Pastry shop first). None without the table. */
export function themeIds() {
  return table?.THEMES ? Object.keys(table.THEMES) : [];
}

/* The theme's entry, { mascot, rotation, limited, version, label, card }: Pastry shop's for an
 * unknown or missing id, null only without the table. */
export function themeEntry(id) {
  return table?.THEMES?.[knownTheme(id)] ?? null;
}

/* The theme's collectibles, its rotation then its app-only items, as its list file has them.
 * A new array each time. */
export function themeKeysOf(id) {
  const entry = themeEntry(id);
  return entry ? entry.rotation.concat(entry.limited) : [];
}

/* The sprite key of the theme's mascot. Null without the table: spriteCanvas then hides. */
export function mascotKey(id) {
  return themeEntry(id)?.mascot ?? null;
}

/* The outline colour (palette X) of a drawing: the mascot's crumbs are this colour. */
export function outlineColour(spriteKey) {
  const known = typeof spriteKey === 'string' && table?.SPRITES && Object.hasOwn(table.SPRITES, spriteKey);
  return (known && table.SPRITES[spriteKey].palette?.X) || FALLBACK_OUTLINE;
}

/* One of the theme's texts in the interface's language; English when it has none in that one. */
function inLanguage(texts, locale) {
  if (!texts) return '';
  return (Object.hasOwn(texts, locale) ? texts[locale] : texts.en) ?? '';
}

/* The theme's name. */
export function themeLabel(id, locale) {
  return inLanguage(themeEntry(id)?.label, locale);
}

/* The line under the theme's card, its {count} worked out from the list, never typed in. */
export function themeCard(id, locale) {
  return inLanguage(themeEntry(id)?.card, locale).replaceAll('{count}', String(themeKeysOf(id).length));
}

/* Where the theme's tab icon and home-screen icon are. Pastry shop's are the files index.html
 * has always named; every other theme's are in icons/<id>/ (scripts/make-icons.mjs). Relative,
 * like index.html's own links: the same files are also published under /crumb/app/. */
export function iconHref(id) {
  const theme = knownTheme(id);
  return theme === DEFAULT_THEME ? 'favicon.svg' : `icons/${theme}/favicon.svg`;
}

export function touchIconHref(id) {
  const theme = knownTheme(id);
  return theme === DEFAULT_THEME ? 'icons/icon-180.png' : `icons/${theme}/icon-180.png`;
}
