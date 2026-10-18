/* Colour arithmetic for the contrast tests, as WCAG 2 defines it: a colour read from a
 * stylesheet or from what a browser computes, every colour of a plain value or a gradient,
 * relative luminance, the contrast ratio of two opaque colours, and a see-through colour laid
 * on an opaque one. A helper module, not a test file: tests/colours.test.mjs and the browser
 * specs import it. */

/* A colour as these stylesheets write it or a browser computes it: #rgb, #rgba, #rrggbb,
 * #rrggbbaa, rgb() or rgba() (commas or spaces, an optional "/ alpha", numbers or
 * percentages), or transparent. Returns { r, g, b, a }: channels 0–255, alpha 0–1. Anything
 * else throws, so a value the tests cannot read never passes unseen. */
export function parseColour(text) {
  const value = String(text).trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map(digit => digit + digit).join('') : hex[1];
    const at = index => Number.parseInt(digits.slice(index, index + 2), 16);
    return { r: at(0), g: at(2), b: at(4), a: digits.length === 8 ? at(6) / 255 : 1 };
  }
  const call = /^rgba?\(([^()]*)\)$/.exec(value);
  if (call) {
    const parts = call[1].split(/[\s,/]+/).filter(Boolean);
    const number = (part, whole) => (part.endsWith('%') ? (Number.parseFloat(part) * whole) / 100 : Number.parseFloat(part));
    if (parts.length === 3 || parts.length === 4) {
      const colour = {
        r: number(parts[0], 255),
        g: number(parts[1], 255),
        b: number(parts[2], 255),
        a: parts.length === 4 ? number(parts[3], 1) : 1,
      };
      if (Object.values(colour).every(Number.isFinite)) return colour;
    }
  }
  throw new Error(`Not a colour these tests can read: ${text}`);
}

/* Every colour in a value, in order: the one colour of a plain value, or each stop of a
 * gradient (of several gradients, too). [] when there is none (none, a length). Put var() in
 * first: an unresolved variable has no colour to find. */
export function stops(value) {
  return (String(value).match(/#[0-9a-f]{3,8}\b|rgba?\([^()]*\)|\btransparent\b/gi) ?? []).map(parseColour);
}

/* Relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }) {
  const linear = channel => {
    const share = channel / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/* The contrast ratio of two opaque colours, 1 to 21, whichever is lighter. A see-through
 * colour throws: lay it on what is behind it first (blend). */
export function contrast(first, second) {
  for (const colour of [first, second]) {
    if (colour.a !== 1) throw new Error(`Lay a see-through colour on its ground first: ${JSON.stringify(colour)}`);
  }
  const [lighter, darker] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/* What is seen when `over` is drawn at `alpha` (0 to 1: its own alpha times any opacity it sits
 * in) on the opaque `under`. */
export function blend(over, under, alpha) {
  if (under.a !== 1) throw new Error(`The ground must be opaque: ${JSON.stringify(under)}`);
  const mix = channel => over[channel] * alpha + under[channel] * (1 - alpha);
  return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
}
