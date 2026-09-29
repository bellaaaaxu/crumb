/* Small DOM helpers.
 *
 * Anything a person typed — names, reasons, benefit descriptions — only ever
 * reaches the page through textContent. Nothing in the product uses
 * innerHTML. `attrs` is for attributes written in this codebase, never for
 * values taken from the server; links from the server go through safeUrl. */

export function el(tag, { text, attrs = {}, on = {} } = {}, children = []) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const [event, handler] of Object.entries(on)) node.addEventListener(event, handler);
  node.append(...children.filter(child => child !== null && child !== undefined && child !== false));
  return node;
}

/* Only https:, mailto: and this site's own addresses become links. */
export function safeUrl(value) {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === 'https:' || url.protocol === 'mailto:' || url.origin === window.location.origin) return url.href;
  } catch {
    // not a URL
  }
  return null;
}

let counter = 0;
export const uid = prefix => `${prefix}-${(counter += 1)}`;

/**
 * A labelled form control with an optional hint and an error slot that is
 * wired to aria-describedby / aria-invalid. Forms use novalidate and these
 * messages instead of the browser's own bubbles, which ignore the page language.
 */
export function field({ label, name, type = 'text', value = '', hint, multiline = false, options, attrs = {} }) {
  const id = uid(`field-${name}`);
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-error`;
  let control;
  if (options) {
    control = el('select', { attrs: { id, name, ...attrs } },
      options.map(option => el('option', { text: option.label, attrs: { value: option.value } })));
  } else if (multiline) {
    control = el('textarea', { attrs: { id, name, rows: 3, ...attrs } });
  } else {
    control = el('input', { attrs: { id, name, type, ...attrs } });
  }
  control.value = value;
  control.setAttribute('aria-describedby', [hintId, errorId].filter(Boolean).join(' '));
  const error = el('p', { attrs: { id: errorId, class: 'field-error', hidden: true } });
  const wrapper = el('div', { attrs: { class: 'field' } }, [
    el('label', { text: label, attrs: { for: id } }),
    hint ? el('p', { text: hint, attrs: { id: hintId, class: 'field-hint' } }) : null,
    control,
    error,
  ]);
  return {
    wrapper,
    control,
    setError(message) {
      error.textContent = message ?? '';
      error.hidden = !message;
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    },
  };
}

/* A group of radio buttons under a legend. */
export function radios({ legend, name, options, value }) {
  const inputs = [];
  const fieldset = el('fieldset', { attrs: { class: 'radios' } }, [
    el('legend', { text: legend }),
    ...options.map(option => {
      const id = uid(`radio-${name}`);
      const input = el('input', { attrs: { type: 'radio', id, name, value: option.value, checked: option.value === value } });
      inputs.push(input);
      return el('div', { attrs: { class: 'radio' } }, [
        input,
        el('label', { attrs: { for: id } }, [
          el('span', { text: option.label, attrs: { class: 'radio-label' } }),
          option.detail ? el('span', { text: option.detail, attrs: { class: 'radio-detail' } }) : null,
        ]),
      ]);
    }),
  ]);
  return {
    fieldset,
    inputs,
    get value() {
      return inputs.find(input => input.checked)?.value;
    },
    set disabled(state) {
      for (const input of inputs) input.disabled = state;
    },
  };
}

/* The one message area of a form. role="alert" so it is read out when it appears. */
export function formError() {
  const node = el('p', { attrs: { class: 'form-error', role: 'alert', hidden: true } });
  return {
    node,
    show(message) {
      node.textContent = message;
      node.hidden = false;
    },
    clear() {
      node.textContent = '';
      node.hidden = true;
    },
  };
}

export function button(label, { kind = 'secondary', type = 'button', attrs = {}, on = {} } = {}) {
  return el('button', { text: label, attrs: { type, class: `btn btn-${kind}`, ...attrs }, on });
}

/**
 * A modal dialog built on <dialog>: the page behind it is inert, Escape
 * closes it, and focus goes back to whatever opened it.
 */
export function openDialog({ title, content, onClose }) {
  const opener = document.activeElement;
  const titleId = uid('dialog-title');
  const dialog = el('dialog', { attrs: { class: 'dialog', 'aria-labelledby': titleId } }, [
    el('h2', { text: title, attrs: { id: titleId, class: 'dialog-title' } }),
    content,
  ]);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  });
  dialog.showModal();
  return { dialog, close: () => { if (dialog.open) dialog.close(); } };
}

export function closeAllDialogs() {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
}

/* Short confirmations go to one polite live region, so screen readers hear them too. */
export function toast(message, { tone = 'info' } = {}) {
  const region = document.getElementById('toasts');
  if (!region) return;
  const item = el('p', { text: message, attrs: { class: `toast toast-${tone}` } });
  region.append(item);
  window.setTimeout(() => item.remove(), 7000);
}

export function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  return Promise.reject(new Error('Clipboard unavailable'));
}

/* True when Crumb was opened from a home-screen icon as a separate web app. On some phones
 * that app keeps its own storage, so it has none of the browser's sign-in. */
export const openedAsHomeScreenApp = () =>
  window.navigator.standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
