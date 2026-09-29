/* The pixel art comes from /assets/sprites.js, the same table the public demo
 * draws from. This module is the only place that touches it.
 *
 * sprites.js declares `const Pixel` in a classic script. That makes a global
 * *lexical* binding, not a property of window, so `globalThis.Pixel` is
 * undefined — but a module can still reach it by its bare name. */

const table = typeof Pixel === 'undefined' ? null : Pixel; // eslint-disable-line no-undef

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
