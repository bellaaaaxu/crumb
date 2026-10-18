/* What a page looks like in colour, for tests/e2e/light-unchanged.spec.mjs: the colour-type
 * properties of every rendered element, of its ::before and ::after, and of an open modal
 * dialog's ::backdrop. First at rest; then with :hover, :active and :focus-visible forced on
 * each control, and :disabled on each button, input, select and textarea, one state at a time,
 * through the DevTools protocol (CSS.forcePseudoState). A forced state is kept as the elements
 * it changes, so a hover that shows a name tip, or a focus that rings a picker slot, is part of
 * the record.
 *
 * Elements are keyed by where they sit, never by what they say: from the nearest element with
 * a fixed id (#app, #main, #toasts, the demo's own ids), or else the nearest landmark that is the
 * only one of its kind on the page, or else body; then tag, classes and position down to the
 * element. An id that uid() in app/dom.js made ("field-name-12", "field-name-12-hint",
 * "field-name-12-error") counts as no id: it comes from a page-wide counter, so it moves
 * whenever something made before it is added. A date or a balance changes text, never a key.
 * The café's theme card and shop button are skipped with everything in them, so a version that
 * has them records the same keys as one that does not. */

export const COLOUR_PROPERTIES = [
  'color', 'background-color', 'background-image',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'box-shadow', 'outline-color', 'outline-style', 'accent-color', 'text-decoration-color',
  'caret-color', 'column-rule-color', 'fill', 'stroke',
];

export const FORCED_STATES = ['hover', 'active', 'focus-visible', 'disabled'];
const DISABLEABLE = ['button', 'input', 'select', 'textarea'];

/* An id uid() made: see above. */
export const MADE_ID = /-\d+(?:-hint|-error)?$/;

/* Runs in the page (Playwright sends its source, so it uses nothing from this module). Leaves
 * window.__crumbStyleRecorder behind: `changes()` settles the page, reads it again and returns
 * what differs from the reading taken here, as { key: values } with null for an element that
 * is no longer rendered. */
async function installRecorder({ properties, within, madeId }) {
  const MADE = new RegExp(madeId);
  const LANDMARK_TAGS = ['header', 'footer', 'main', 'nav', 'aside'];
  const LANDMARK_ROLES = ['banner', 'contentinfo', 'main', 'navigation', 'complementary', 'region', 'search'];
  const SKIPPED = '.theme-card:has(input[name="theme"][value="cafe"]), [data-shop="cafe"]';
  const CONTROLS = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
  const scope = within ? document.querySelector(within) : document.body;
  if (!scope) throw new Error(`nothing on the page matches ${within}`);

  const named = node => node.localName + [...node.classList].map(name => `.${name}`).join('');
  const selector = node => node.localName + [...node.classList].map(name => `.${CSS.escape(name)}`).join('');
  const landmark = node => LANDMARK_TAGS.includes(node.localName)
    || LANDMARK_ROLES.includes(node.getAttribute('role'))
    || (node.localName === 'section' && (node.hasAttribute('aria-label') || node.hasAttribute('aria-labelledby')));
  const anchor = node => {
    if (node.id && !MADE.test(node.id)) return `#${node.id}`;
    if (landmark(node) && document.querySelectorAll(selector(node)).length === 1) return named(node);
    return null;
  };
  const valuesOf = style => properties.map(name => style.getPropertyValue(name));

  /* Until no CSS transition is left running, then two frames. Under reduced motion every
   * property change is a 0.01 ms transition (app.css, style.css), so a read straight after a
   * change sees the old value. document.getAnimations() brings style up to date first, so a
   * transition the last change started is already in the list. The frames are the document
   * timeline's, not requestAnimationFrame's: Playwright's clock, which holds a toast or the
   * intro on the page, holds requestAnimationFrame as well. */
  async function settle() {
    for (let round = 0; ; round += 1) {
      const moving = document.getAnimations().filter(animation => animation instanceof CSSTransition && animation.playState !== 'finished');
      if (!moving.length) break;
      if (round === 50) throw new Error(`transitions still running: ${moving.map(animation => animation.transitionProperty).join(', ')}`);
      await Promise.all(moving.map(animation => animation.finished.catch(() => {})));
    }
    for (let frame = 0; frame < 2; frame += 1) await document.documentElement.animate(null, { duration: 1 }).finished;
  }

  await settle();

  /* Every element under body (body included) that may be recorded, with its key, found once:
   * a forced state changes how elements look, never which elements there are. */
  const elements = [];
  const visit = (node, parentKey) => {
    if (node.matches(SKIPPED)) return;
    const key = node === document.body ? 'body'
      : anchor(node) ?? `${parentKey} > ${named(node)}:nth-child(${[...node.parentElement.children].indexOf(node) + 1})`;
    if (scope.contains(node)) elements.push({ node, key });
    for (const child of node.children) visit(child, key);
  };
  visit(document.body, '');

  /* The rendered ones, as they look now. */
  function read() {
    const found = new Map();
    for (const { node, key } of elements) {
      if (!node.checkVisibility()) continue;
      found.set(key, valuesOf(getComputedStyle(node)));
      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(node, pseudo);
        if (style.content !== 'none' && style.content !== 'normal') found.set(key + pseudo, valuesOf(style));
      }
      if (node.localName === 'dialog' && node.matches(':modal')) found.set(`${key}::backdrop`, valuesOf(getComputedStyle(node, '::backdrop')));
    }
    return found;
  }

  const rest = read();
  // The controls: rendered at rest, so a state can be forced on them.
  const controls = elements.filter(({ node, key }) => rest.has(key) && node.matches(CONTROLS));
  const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
  window.__crumbStyleRecorder = {
    controls: controls.map(({ node }) => node),
    async changes() {
      await settle();
      const now = read();
      const changed = {};
      for (const [key, values] of now) if (!rest.has(key) || !same(values, rest.get(key))) changed[key] = values;
      for (const key of rest.keys()) if (!now.has(key)) changed[key] = null;
      return changed;
    },
  };
  return { elements: Object.fromEntries(rest), controls: controls.map(({ node, key }) => ({ key, tag: node.localName })) };
}

/**
 * The colours of the page as it is now: `{ label, elements: { key: values }, states: [{ target,
 * state, changes: { key: values | null } }] }`, values in the order of COLOUR_PROPERTIES. A state
 * that changes nothing is left out. `within` (a selector) keeps the record to that element and
 * what is inside it, keyed as everywhere else: the oven intro and the shutter, recorded with
 * motion, while the page behind them is still moving.
 */
export async function recordStyles(page, label, { within = null } = {}) {
  // Away from every control: hover is the forced one's alone.
  await page.mouse.move(0, 0);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await cdp.send('DOM.getDocument', { depth: 0 });
    const { elements, controls } = await page.evaluate(installRecorder, { properties: COLOUR_PROPERTIES, within, madeId: MADE_ID.source });
    const states = [];
    for (const [index, { key, tag }] of controls.entries()) {
      const { result } = await cdp.send('Runtime.evaluate', { expression: `window.__crumbStyleRecorder.controls[${index}]` });
      const { nodeId } = await cdp.send('DOM.requestNode', { objectId: result.objectId });
      for (const state of FORCED_STATES) {
        if (state === 'disabled' && !DISABLEABLE.includes(tag)) continue;
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] });
        const changes = await page.evaluate(() => window.__crumbStyleRecorder.changes());
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
        const left = await page.evaluate(() => window.__crumbStyleRecorder.changes());
        if (Object.keys(left).length)
          throw new Error(`${label}: the page did not come back to rest after :${state} on ${key}; still different: ${Object.keys(left).slice(0, 5).join(', ')}`);
        if (Object.keys(changes).length) states.push({ target: key, state, changes });
      }
    }
    const record = { label, elements, states };
    const madeIds = keysOf(record).filter(key => key.split(' > ').some(part => /^#/.test(part) && MADE_ID.test(part.replace(/::.*$/, ''))));
    if (madeIds.length) throw new Error(`${label}: keys anchored on an id uid() made: ${madeIds.slice(0, 5).join(', ')}`);
    return record;
  } finally {
    await page.evaluate(() => { delete window.__crumbStyleRecorder; }).catch(() => {});
    await cdp.detach().catch(() => {});
  }
}

/* Every key a record names. */
function keysOf(record) {
  return [...Object.keys(record.elements), ...record.states.flatMap(entry => [entry.target, ...Object.keys(entry.changes)])];
}

/* ---------------------------------------------------------------- the baseline file
 * Records are kept compact: one table of keys and one of distinct value lists, which every
 * scene points into (an element that a state hides points at -1). One entry per line, so a
 * change to it reads as a diff. */

export function packScenes(scenes) {
  const keys = [];
  const styles = [];
  const keyIndex = new Map();
  const styleIndex = new Map();
  const keyOf = key => {
    if (!keyIndex.has(key)) keyIndex.set(key, keys.push(key) - 1);
    return keyIndex.get(key);
  };
  const styleOf = values => {
    if (values === null) return -1;
    const id = JSON.stringify(values);
    if (!styleIndex.has(id)) styleIndex.set(id, styles.push(values) - 1);
    return styleIndex.get(id);
  };
  const packed = {};
  for (const label of Object.keys(scenes).sort()) {
    const { elements, states } = scenes[label];
    packed[label] = {
      elements: Object.entries(elements).map(([key, values]) => [keyOf(key), styleOf(values)]),
      states: states.map(({ target, state, changes }) =>
        [keyOf(target), state, Object.entries(changes).map(([key, values]) => [keyOf(key), styleOf(values)])]),
    };
  }
  return { properties: COLOUR_PROPERTIES, keys, styles, scenes: packed };
}

export function unpackScenes(file) {
  const valuesAt = index => (index === -1 ? null : file.styles[index]);
  const scenes = {};
  for (const [label, scene] of Object.entries(file.scenes)) {
    scenes[label] = {
      label,
      elements: Object.fromEntries(scene.elements.map(([key, style]) => [file.keys[key], valuesAt(style)])),
      states: scene.states.map(([target, state, changes]) => ({
        target: file.keys[target], state, changes: Object.fromEntries(changes.map(([key, style]) => [file.keys[key], valuesAt(style)])),
      })),
    };
  }
  return scenes;
}

export function baselineText(file) {
  const list = (items, write) => items.map((item, index) => `${write(item)}${index < items.length - 1 ? ',' : ''}`);
  const labels = Object.keys(file.scenes);
  return [
    '{',
    `"properties": ${JSON.stringify(file.properties)},`,
    '"keys": [',
    ...list(file.keys, key => JSON.stringify(key)),
    '],',
    '"styles": [',
    ...list(file.styles, values => JSON.stringify(values)),
    '],',
    '"scenes": {',
    ...list(labels, label => `${JSON.stringify(label)}: ${JSON.stringify(file.scenes[label])}`),
    '}',
    '}',
    '',
  ].join('\n');
}

/**
 * What differs between two records of one scene, as lines a person can read: an element that
 * is new or gone, a property whose value changed, and the same for each forced state. Empty
 * when they match item for item.
 */
export function differences(expected, actual) {
  const lines = [];
  const compare = (where, was, now, { onlyBefore, onlyNow }) => {
    for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
      const before = was[key];
      const after = now[key];
      if (after === undefined) lines.push(`${where}${key}: ${onlyBefore}`);
      else if (before === undefined) lines.push(`${where}${key}: ${onlyNow}`);
      else if (before === null || after === null) {
        if (before !== after) lines.push(`${where}${key}: ${before === null ? 'hidden in 0.3.0, shown now' : 'shown in 0.3.0, hidden now'}`);
      } else {
        COLOUR_PROPERTIES.forEach((name, index) => {
          if (before[index] !== after[index]) lines.push(`${where}${key} ${name}: ${before[index]} -> ${after[index]}`);
        });
      }
    }
  };
  compare('', expected.elements, actual.elements, { onlyBefore: 'in 0.3.0, missing now', onlyNow: 'not in 0.3.0' });
  const byTarget = record => new Map(record.states.map(entry => [`:${entry.state} on ${entry.target}`, entry.changes]));
  const was = byTarget(expected);
  const now = byTarget(actual);
  for (const target of new Set([...was.keys(), ...now.keys()])) {
    compare(`with ${target}: `, was.get(target) ?? {}, now.get(target) ?? {},
      { onlyBefore: 'changed by it in 0.3.0, not now', onlyNow: 'changed by it now, not in 0.3.0' });
  }
  return lines;
}
