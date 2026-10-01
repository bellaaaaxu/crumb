/* Pieces the member page, the Team page and Settings all use, kept in one copy. */

import { keyFor, request, settleKey, wasRefused } from '../api.js';
import { button, el, formError, openDialog, uid } from '../dom.js';
import { formatDateTime, t } from '../i18n.js';

export const loading = () => el('p', { text: t('common.loading'), attrs: { class: 'loading', role: 'status' } });

export function badge(status) {
  return el('span', { text: t(`status.${status}`), attrs: { class: `badge badge-${status}` } });
}

/* A white brick with an uppercase title. */
export function section(titleText, children, { className = '', titleId = uid('section') } = {}) {
  return el('section', { attrs: { class: `tile ${className}`.trim(), 'aria-labelledby': titleId } }, [
    el('h2', { text: titleText, attrs: { id: titleId, class: 'tile-title' } }),
    ...children,
  ]);
}

/* A "Show more" button that fetches the next page and appends its rows. */
export function pager(ctx, list, page, pathFor, toRow) {
  let cursor = page.nextCursor;
  const more = button(t('common.showMore'), {
    kind: 'quiet',
    on: {
      click: async () => {
        // Disabling the focused button sends focus to <body>, so note it now and put it back
        // afterwards: keyboard and screen-reader users keep their place in the list.
        const hadFocus = document.activeElement === more;
        more.disabled = true;
        try {
          const next = await request(pathFor(cursor));
          const last = list.lastElementChild;
          // One row at a time, because toRow may append nodes of its own first (the member
          // log's month headings) and those must land before their row, not before the page.
          for (const item of next.items) {
            const row = toRow(item);
            if (row) list.append(row);
          }
          cursor = next.nextCursor;
          if (!cursor) {
            more.remove();
            if (hadFocus) {
              const first = (last ? last.nextElementSibling : list.firstElementChild) ?? list;
              if (!first.hasAttribute('tabindex')) first.setAttribute('tabindex', '-1');
              first.focus();
            }
          }
        } catch (failure) {
          ctx.fail(failure); // a lost session goes back to sign-in instead of a vague toast
        } finally {
          more.disabled = false;
          if (hadFocus && more.isConnected) more.focus();
        }
      },
    },
  });
  return cursor ? more : null;
}

/* A single ledger row is never zero, but a total or a batch sum can be: that one gets no sign. */
export function signedAmount(units, money) {
  if (units === 0) return money(0);
  return `${units > 0 ? '+' : '−'}${money(Math.abs(units))}`;
}

export const kindLabel = kind => t(`kind.${kind}`);

/**
 * What a ledger entry is, with the other party's name where there is one. The member page
 * reads it as the member's own entry; the Team log puts the member's name in front and
 * passes `own: false`, where "You jotted this down" would name the wrong person.
 */
export function historyTitle(item, { own = true } = {}) {
  if (item.kind === 'grant') return t('history.grant', { name: item.actorName ?? '' });
  if (item.kind === 'revoke') return t('history.revoke');
  if (item.kind === 'spend') return own ? t('history.spend') : kindLabel('spend');
  if (item.kind === 'void') return t('history.void');
  if (item.kind === 'redeem') return t('history.redeem', { name: item.rewardName ?? '' });
  if (item.kind === 'refund') return t('history.refund', { name: item.rewardName ?? '' });
  // A kind added later shows its short label instead of passing for a refund.
  return kindLabel(item.kind);
}

/* A change of this kind went out and no answer came back. Says when, and what a resend does. */
export function unconfirmedNotice(key, times) {
  const time = formatDateTime(new Date(times.at(-1)).toISOString());
  return el('p', { text: t(key, { time }), attrs: { class: 'notice', role: 'note' } });
}

/**
 * A dialog for one change. Its idempotency key belongs to `action()`, kept until the server
 * gives a definite answer, so sending the same thing again after a dropped connection
 * repeats the same request. Focus starts on the first field, or on Cancel — never on a
 * destructive button.
 */
export function actionDialog(ctx, { title, intro = [], fields = [], extra = [], submitLabel, danger = false, validate, action, send, done }) {
  const error = formError();
  const submit = button(submitLabel, { kind: danger ? 'danger' : 'primary', type: 'submit' });
  const opened = {};
  const cancel = button(t('common.cancel'), { on: { click: () => opened.close() } });
  const form = el('form', {
    attrs: { class: 'stack', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        for (const item of fields) item.setError();
        if (validate && !validate()) return;
        const id = action();
        submit.disabled = true;
        let result;
        try {
          result = await send(await keyFor(id));
        } catch (failure) {
          if (wasRefused(failure)) await settleKey(id);
          submit.disabled = false;
          ctx.fail(failure, error);
          return;
        }
        // A definite answer: only now does the key go, and nothing after this is a failed request.
        await settleKey(id);
        opened.close();
        done(result);
      },
    },
  }, [
    ...intro.map(text => (typeof text === 'string' ? el('p', { text }) : text)),
    ...fields.map(item => item.wrapper),
    ...extra,
    error.node,
    el('div', { attrs: { class: 'dialog-actions' } }, [cancel, submit]),
  ]);
  Object.assign(opened, openDialog({ title, content: form }));
  (fields[0]?.control ?? cancel).focus();
  return { dialog: opened.dialog, submit };
}

/* One-tap row actions keep their key until a definite answer, so tapping again is a retry. */
export async function oneTap(ctx, action, { method = 'POST', path, body }, onDone) {
  let result;
  try {
    result = await request(path, { method, body, key: await keyFor(action) });
  } catch (failure) {
    if (wasRefused(failure)) await settleKey(action);
    ctx.fail(failure);
    return false;
  }
  await settleKey(action);
  onDone(result);
  return true;
}
