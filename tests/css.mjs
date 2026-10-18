/* Reads the project's own stylesheets for the colour tests: rules, the at-rules they sit in,
 * their declarations, and var() worked out from a set of variables. Not a general CSS parser:
 * it knows comments, quoted strings, brackets, @media and @keyframes blocks and plain style
 * rules, which is all app/app.css and assets/style.css use; anything else stops it with an error. */

const squeeze = text => text.replace(/\s+/g, ' ').trim();

/* The index of the first of `stops` at bracket depth 0 and outside quotes, from `from`; the
 * text's length when there is none. */
function until(text, from, stops) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      i = j;
    } else if (depth === 0 && stops.includes(ch)) return i;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
  }
  return text.length;
}

function withoutComments(text) {
  let out = '';
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) throw new Error('A comment is never closed.');
      out += ' ';
      i = end + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function declarationsIn(body) {
  const declarations = [];
  for (let i = 0; i < body.length;) {
    const end = until(body, i, ';');
    const text = body.slice(i, end).trim();
    i = end + 1;
    if (!text) continue;
    const colon = text.indexOf(':');
    if (colon < 1) throw new Error(`Not a declaration: ${text}`);
    const name = text.slice(0, colon).trim();
    let value = squeeze(text.slice(colon + 1));
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/\s*!\s*important$/i, '');
    declarations.push({ property: name.startsWith('--') ? name : name.toLowerCase(), value, important });
  }
  return declarations;
}

/* Rules from `start` up to the `}` that closes the block (its index), or to the end. */
function readBlock(text, start, context, rules) {
  for (let i = start; ;) {
    const stop = until(text, i, '{};');
    const prelude = squeeze(text.slice(i, stop));
    if (stop === text.length || text[stop] === '}') {
      if (prelude) throw new Error(`A rule is not finished: ${prelude}`);
      return stop;
    }
    if (text[stop] === ';') throw new Error(`Not expected in these stylesheets: ${prelude};`);
    if (prelude.startsWith('@')) {
      if (!/^@(media|keyframes) /.test(prelude)) throw new Error(`Not expected in these stylesheets: ${prelude}`);
      const end = readBlock(text, stop + 1, [...context, prelude], rules);
      if (end === text.length) throw new Error(`${prelude} is never closed.`);
      i = end + 1;
    } else {
      const end = until(text, stop + 1, '}');
      if (end === text.length) throw new Error(`${prelude} is never closed.`);
      rules.push({ context, selector: prelude, declarations: declarationsIn(text.slice(stop + 1, end)) });
      i = end + 1;
    }
  }
}

/* Every style rule, in source order: { context, selector, declarations }. `context` lists the
 * at-rules it sits in, outermost first ([] at the top level, ['@keyframes dip'] for a keyframe);
 * `selector` is the rule's selector list as written, whitespace squeezed; each declaration is
 * { property, value, important }, with `!important` taken off the value. */
export function parseCss(text) {
  const clean = withoutComments(text);
  const rules = [];
  const end = readBlock(clean, 0, [], rules);
  if (end !== clean.length) throw new Error('A } closes nothing.');
  return rules;
}

/* A selector list split at its top-level commas: ".a, .b:not(.c, .d)" → [".a", ".b:not(.c, .d)"]. */
export function splitSelectors(list) {
  const parts = [];
  for (let i = 0; i <= list.length;) {
    const end = until(list, i, ',');
    parts.push(squeeze(list.slice(i, end)));
    i = end + 1;
  }
  return parts.filter(Boolean);
}

/* The top-level rules whose selector list is exactly `selector` (say ':root, [data-theme]'). */
export function topLevel(rules, selector) {
  return rules.filter(rule => rule.context.length === 0 && rule.selector === selector);
}

/* The custom properties the given rules declare, in order; a later one wins. */
export function variablesOf(rules) {
  const variables = new Map();
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) if (property.startsWith('--')) variables.set(property, value);
  }
  return variables;
}

/* `value` with each var(--name) or var(--name, fallback) whose --name is in `variables` replaced
 * by that variable's value, itself worked out the same way. One that is not there (a variable a
 * script sets) is left as written. */
export function substitute(value, variables, seen = []) {
  let out = '';
  let from = 0;
  for (;;) {
    const at = value.indexOf('var(', from);
    if (at === -1) return out + value.slice(from);
    const close = until(value, at + 4, ')');
    if (close === value.length) throw new Error(`An unclosed var( in: ${value}`);
    const name = value.slice(at + 4, until(value, at + 4, ',)')).trim();
    if (variables.has(name)) {
      if (seen.includes(name)) throw new Error(`${name} refers to itself.`);
      out += value.slice(from, at) + substitute(variables.get(name), variables, [...seen, name]);
    } else {
      out += value.slice(from, close + 1);
    }
    from = close + 1;
  }
}

/* One spelling for values that compute the same: whitespace squeezed, none just inside
 * brackets, one space after a comma, hex colours in lower case. */
export function normalise(value) {
  return squeeze(value)
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .replace(/#[0-9a-f]{3,8}\b/gi, hex => hex.toLowerCase());
}
