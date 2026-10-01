/* The keypad sheet for a self-recorded entry: digits in, an amount out. Credit is typed
 * as cents ("1250" shows 12.50); points as whole numbers. Built on <dialog>, so the page
 * behind it is inert and Escape closes it, except while an entry is on its way. */

import { button, el, formError, openDialog, toast, uid } from './dom.js';
import { t } from './i18n.js';

const MAX_DIGITS = 9;

/**
 * Opens the sheet. `available` is in units; `money(units)` formats, so whether the digits
 * are cents or points is its concern alone; `onConfirm(units)` sends the entry and resolves
 * when it is recorded (or throws to keep the sheet open with the error shown). `notice` is
 * an optional node shown above the amount.
 */
export function openAmountSheet({ available, money, onConfirm, notice = null }) {
  let typed = '';
  // True while an entry is on its way: the amount stays as sent and Confirm stays off, so
  // one sheet never sends a second, different amount before the first is answered.
  let busy = false;
  const units = () => (typed === '' ? 0 : Number(typed));
  const shown = el('span', { text: money(0) });
  const amount = el('p', { attrs: { class: 'sheet-amount zero', 'aria-live': 'polite' } }, [shown]);
  // Live, and the description of Confirm: a screen reader then hears why Confirm went off,
  // not only the new amount.
  const warnId = uid('sheet-warn');
  const warn = el('p', { attrs: { class: 'sheet-warn', id: warnId, 'aria-live': 'polite' } });
  const error = formError();
  const confirm = button(t('spend.confirm'), { kind: 'confirm', attrs: { disabled: true, 'aria-describedby': warnId } });
  let opened;
  const cancel = button(t('common.cancel'), { on: { click: () => opened.close() } });

  const paint = () => {
    const value = units();
    const over = value > available;
    shown.textContent = money(value);
    amount.classList.toggle('zero', value === 0);
    amount.classList.toggle('over', over);
    warn.textContent = over ? t('spend.over') : '';
    confirm.disabled = busy || value <= 0 || over;
  };
  const press = key => {
    if (busy) return;
    if (key === 'C') typed = '';
    else if (key === 'back') typed = typed.slice(0, -1);
    else if (typed.length < MAX_DIGITS) typed = (typed + key).replace(/^0+/, '');
    paint();
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'].map(key => el('button', {
    text: key === 'back' ? '⌫' : key,
    attrs: {
      type: 'button', class: 'key',
      'aria-label': key === 'C' ? t('spend.clear') : key === 'back' ? t('spend.backspace') : key,
    },
    on: { click: () => press(key) },
  }));
  const keypad = el('div', { attrs: { class: 'keys', role: 'group', 'aria-label': t('spend.keypadLabel') } }, keys);

  confirm.addEventListener('click', async () => {
    error.clear();
    busy = true;
    confirm.disabled = true;
    cancel.disabled = true;
    try {
      await onConfirm(units());
      opened.close();
    } catch (failure) {
      busy = false;
      // The browser may still have closed the sheet (see 'cancel' below): the message would
      // land on a detached node, so it goes where it can be seen.
      if (!opened.dialog.open) {
        toast(failure.message, { tone: 'error' });
        return;
      }
      error.show(failure.message);
      cancel.disabled = false;
      paint();
      // Confirm lost focus when it was turned off, and keys typed outside the sheet never
      // reach the keypad: bring focus back in.
      if (!opened.dialog.contains(document.activeElement)) (confirm.disabled ? keys[0] : confirm).focus();
    }
  });
  // Physical keyboards work too. Enter on the keypad, where the sheet puts focus, confirms,
  // or does nothing while Confirm is off: it never presses the focused key, which would add
  // a digit nobody typed (and a second Enter could send it). On Cancel, Confirm or a link it
  // keeps that control's own meaning.
  const onKey = event => {
    if (/^[0-9]$/.test(event.key)) press(event.key);
    else if (event.key === 'Backspace' || event.key === 'Delete') press('back');
    else if (event.key === 'Enter' && !event.target.closest('a, button:not(.key)')) {
      if (!confirm.disabled) confirm.click();
    } else return;
    event.preventDefault();
  };
  const content = el('div', { attrs: { class: 'stack' } }, [
    notice,
    // A class, not a style attribute: the Content Security Policy refuses inline styles.
    el('p', { text: t('spend.available', { amount: money(available) }), attrs: { class: 'muted small sheet-available' } }),
    amount, keypad, warn, error.node,
    el('div', { attrs: { class: 'sheet-actions' } }, [cancel, confirm]),
  ]);
  content.addEventListener('keydown', onKey);
  opened = openDialog({ title: t('spend.title'), content });
  opened.dialog.classList.add('sheet');
  // While an entry is on its way, Escape or a phone's back gesture leaves the sheet open, so
  // a refusal has somewhere to show. A browser may force the close on a repeated Escape;
  // the failure then goes to a toast.
  opened.dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  keys[0].focus();
  paint();
  return { close: opened.close, press };
}
