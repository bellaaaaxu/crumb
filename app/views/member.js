/* My Crumb: a member's own balance, collection, benefits, requests and
 * history. Everything here is read from the server for the signed-in person
 * only; there is nothing about anyone else on this page. */

import { keyFor, request, settleKey, unconfirmedSince, wasRefused } from '../api.js';
import { button, el, formError, openDialog, openedAsHomeScreenApp, toast, uid } from '../dom.js';
import { formatDate, formatDateTime, getLocale, t } from '../i18n.js';
import { formatUnits } from '../format.js';
import { spriteCanvas } from '../pixels.js';

const SLOTS_PER_ROW = 6;

export const loading = () => el('p', { text: t('common.loading'), attrs: { class: 'loading', role: 'status' } });

export function badge(status) {
  return el('span', { text: t(`status.${status}`), attrs: { class: `badge badge-${status}` } });
}

export function card(titleText, children, { className = '', titleId = uid('card') } = {}) {
  return el('section', { attrs: { class: `card ${className}`.trim(), 'aria-labelledby': titleId } }, [
    el('h2', { text: titleText, attrs: { id: titleId, class: 'card-title' } }),
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
        more.disabled = true;
        try {
          const next = await request(pathFor(cursor));
          list.append(...next.items.map(toRow).filter(Boolean));
          cursor = next.nextCursor;
          if (!cursor) more.remove();
        } catch (failure) {
          ctx.fail(failure); // a lost session goes back to sign-in instead of a vague toast
        } finally {
          more.disabled = false;
        }
      },
    },
  });
  return cursor ? more : null;
}

const nameIn = names => names?.[getLocale()] ?? names?.en ?? '';

function balanceCard(me, money) {
  const { balance, org } = me;
  const facts = [[t('me.lifetime'), money(balance.lifetimeUnits)]];
  if (balance.reservedUnits > 0) facts.unshift([t('me.reserved'), money(balance.reservedUnits)]);
  return card(t('me.available'), [
    el('p', { text: money(balance.availableUnits), attrs: { class: 'big-number', 'data-testid': 'available-balance' } }),
    org.mode === 'credit' ? el('p', { text: org.unitLabel, attrs: { class: 'eyebrow' } }) : null,
    el('dl', { attrs: { class: 'facts' } }, facts.flatMap(([term, value]) => [el('dt', { text: term }), el('dd', { text: value })])),
  ], { className: 'balance-card' });
}

function slot(item) {
  const name = nameIn(item.names);
  const slotButton = el('button', {
    attrs: { type: 'button', class: 'slot-button', 'aria-label': name },
    on: { click: event => event.currentTarget.classList.toggle('show-name') },
  }, [spriteCanvas(item.spriteKey, 3), el('span', { text: name, attrs: { class: 'slot-name', 'aria-hidden': 'true' } })]);
  slotButton.addEventListener('blur', () => slotButton.classList.remove('show-name'));
  return el('li', { attrs: { class: 'slot filled' } }, [slotButton]);
}

function shelfCard(me) {
  const { collection, theme } = me;
  const filled = collection.length;
  const shown = Math.min(theme.size, Math.max(SLOTS_PER_ROW, Math.ceil((filled + 1) / SLOTS_PER_ROW) * SLOTS_PER_ROW));
  const slots = [];
  for (let index = 0; index < shown; index += 1) {
    slots.push(collection[index] ? slot(collection[index]) : el('li', { attrs: { class: 'slot', 'aria-hidden': 'true' } }));
  }
  let next = null;
  if (theme.complete) next = el('p', { text: t('me.complete', { total: theme.size }), attrs: { class: 'shelf-next complete' } });
  else if (theme.next) {
    next = el('p', { attrs: { class: 'shelf-next' } }, [
      spriteCanvas(theme.next.spriteKey, 2),
      el('span', { text: t('me.next', { name: nameIn(theme.next.names) }) }),
    ]);
  }
  return card(t('me.collection'), [
    el('p', { attrs: { class: 'shelf-count' } }, [
      el('span', { text: filled, attrs: { class: 'count-number', 'data-testid': 'collection-count' } }),
      el('span', { text: t('me.ofTotal', { total: theme.size }) }),
    ]),
    el('ul', { attrs: { class: 'shelf', 'aria-label': t('me.collection') } }, slots),
    next,
    el('p', { text: t('me.shelfNote'), attrs: { class: 'muted small' } }),
  ], { className: 'shelf-card' });
}

/* The request key belongs to this benefit at this price until the server answers, so
 * confirming again after a lost answer — even from a reopened dialog — is the same request. */
function confirmRedeem(ctx, me, reward, money) {
  const action = `redeem:${reward.id}:${reward.costUnits}`;
  const error = formError();
  const confirm = button(t('redeem.confirm'), { kind: 'primary', type: 'submit' });
  let dialog;
  const cancel = button(t('common.cancel'), { on: { click: () => dialog.close() } });
  const form = el('form', {
    attrs: { class: 'stack', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        confirm.disabled = true;
        let result;
        try {
          result = await request('/api/redemptions', {
            method: 'POST', body: { rewardId: reward.id, expectedCostUnits: reward.costUnits }, key: await keyFor(action),
          });
        } catch (failure) {
          if (wasRefused(failure)) await settleKey(action);
          confirm.disabled = false;
          if (failure.code === 'PRICE_CHANGED') {
            // Nothing was reserved. Show the new price rather than asking again at the old one.
            dialog.close();
            toast(ctx.errorText(failure), { tone: 'error' });
            ctx.render();
            return;
          }
          ctx.fail(failure, error);
          return;
        }
        await settleKey(action);
        dialog.close();
        toast(t(result.replayed ? 'redeem.alreadySent' : 'redeem.sent', { name: reward.name }));
        ctx.render();
      },
    },
  }, [
    unconfirmedSince('redeem').length ? unconfirmedNotice('redeem.unconfirmed', unconfirmedSince('redeem')) : null,
    el('p', { text: t('redeem.explain', { price: money(reward.costUnits) }) }),
    el('p', { text: t('redeem.after', { amount: money(me.balance.availableUnits - reward.costUnits) }), attrs: { class: 'muted' } }),
    error.node,
    el('div', { attrs: { class: 'dialog-actions' } }, [cancel, confirm]),
  ]);
  dialog = openDialog({ title: t('redeem.title', { name: reward.name }), content: form }).dialog;
}

/* A change of this kind went out and no answer came back — perhaps before the page was
 * reloaded. Says when, and what sending the same change again will do. */
export function unconfirmedNotice(key, times) {
  const time = formatDateTime(new Date(times.at(-1)).toISOString());
  return el('p', { text: t(key, { time }), attrs: { class: 'notice', role: 'note' } });
}

function benefitsCard(ctx, me, rewards, money) {
  if (!rewards.length) return card(t('me.benefits'), [el('p', { text: t('me.noBenefits'), attrs: { class: 'muted' } })], { className: 'benefits-card' });
  return card(t('me.benefits'), [
    el('ul', { attrs: { class: 'rows' } }, rewards.map(reward => {
      const affordable = me.balance.availableUnits >= reward.costUnits;
      return el('li', { attrs: { class: 'row benefit' } }, [
        el('div', { attrs: { class: 'row-main' } }, [
          el('p', { text: reward.name, attrs: { class: 'row-title' } }),
          reward.description ? el('p', { text: reward.description, attrs: { class: 'muted small' } }) : null,
          affordable ? null : el('p', { text: t('me.notEnough'), attrs: { class: 'muted small' } }),
        ]),
        el('p', { text: money(reward.costUnits), attrs: { class: 'price' } }),
        button(t('me.redeem'), {
          kind: 'primary',
          attrs: { 'aria-label': t('me.redeemNamed', { name: reward.name }), disabled: !affordable },
          on: { click: () => confirmRedeem(ctx, me, reward, money) },
        }),
      ]);
    })),
  ], { className: 'benefits-card' });
}

async function cancelRequest(ctx, item) {
  const action = `cancel:${item.id}`;
  try {
    await request(`/api/redemptions/${item.id}/cancel`, { method: 'POST', key: await keyFor(action) });
  } catch (failure) {
    if (wasRefused(failure)) await settleKey(action);
    ctx.fail(failure);
    return;
  }
  await settleKey(action);
  toast(t('me.requestCancelled', { name: item.rewardName }));
  ctx.render();
}

function requestRow(ctx, item, money) {
  const status = item.refunded ? 'refunded' : item.status;
  const titleId = uid('request');
  return el('li', { attrs: { class: 'row' } }, [
    el('div', { attrs: { class: 'row-main' } }, [
      el('p', { text: item.rewardName, attrs: { class: 'row-title', id: titleId } }),
      el('p', { text: `${money(item.costUnits)} · ${formatDate(item.createdAt)}`, attrs: { class: 'muted small' } }),
      item.status === 'rejected' && item.reason ? el('p', { text: item.reason, attrs: { class: 'row-note' } }) : null,
    ]),
    badge(status),
    item.status === 'pending'
      ? button(t('me.cancelRequest'), { attrs: { 'aria-describedby': titleId }, on: { click: () => cancelRequest(ctx, item) } })
      : null,
  ]);
}

function requestsCard(ctx, page, money) {
  if (!page.items.length) return card(t('me.requests'), [el('p', { text: t('me.noRequests'), attrs: { class: 'muted' } })], { className: 'requests-card' });
  const toRow = item => requestRow(ctx, item, money);
  const list = el('ul', { attrs: { class: 'rows' } }, page.items.map(toRow));
  return card(t('me.requests'), [
    list,
    pager(ctx, list, page, cursor => `/api/me/redemptions?limit=10&cursor=${encodeURIComponent(cursor)}`, toRow),
  ], { className: 'requests-card' });
}

export function historyTitle(item) {
  if (item.kind === 'grant') return t('history.grant', { name: item.actorName ?? '' });
  if (item.kind === 'revoke') return t('history.revoke');
  if (item.kind === 'redeem') return t('history.redeem', { name: item.rewardName ?? '' });
  return t('history.refund', { name: item.rewardName ?? '' });
}

export function signedAmount(units, money) {
  return `${units > 0 ? '+' : '−'}${money(Math.abs(units))}`;
}

function historyRow(item, money) {
  return el('li', { attrs: { class: `row history-${item.kind}` } }, [
    el('p', { text: signedAmount(item.deltaUnits, money), attrs: { class: `amount ${item.deltaUnits > 0 ? 'plus' : 'minus'}` } }),
    el('div', { attrs: { class: 'row-main' } }, [
      el('p', { text: historyTitle(item), attrs: { class: 'row-title' } }),
      item.reason ? el('p', { text: item.reason, attrs: { class: 'row-note' } }) : null,
      el('p', { text: formatDate(item.createdAt), attrs: { class: 'muted small' } }),
    ]),
    item.revoked ? badge('revoked') : null,
  ]);
}

function historyCard(ctx, page, money) {
  if (!page.items.length) return card(t('me.history'), [el('p', { text: t('me.noHistory'), attrs: { class: 'muted' } })], { className: 'history-card' });
  const toRow = item => historyRow(item, money);
  const list = el('ul', { attrs: { class: 'rows' } }, page.items.map(toRow));
  return card(t('me.history'), [
    list,
    pager(ctx, list, page, cursor => `/api/me/ledger?limit=10&cursor=${encodeURIComponent(cursor)}`, toRow),
  ], { className: 'history-card' });
}

const HOME_TIP = 'crumb.homeTip';

/* A team member comes in through a one-time link or code, so an icon on the home screen is
 * how they come back. Shown until dismissed on this device, and never inside that icon. */
function homeTip(ctx) {
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(HOME_TIP) === 'dismissed';
  } catch {
    // Storage is blocked: show it; dismissing still hides it for this visit.
  }
  if (ctx.user.role !== 'member' || dismissed || openedAsHomeScreenApp()) return null;
  const titleId = uid('home-tip');
  const tip = el('section', { attrs: { class: 'home-tip', 'aria-labelledby': titleId } }, [
    el('h2', { text: t('home.title'), attrs: { id: titleId, class: 'card-title' } }),
    el('p', { text: t('home.why') }),
    el('p', { text: t('home.iphone'), attrs: { class: 'small' } }),
    el('p', { text: t('home.android'), attrs: { class: 'small' } }),
    button(t('home.done'), {
      kind: 'quiet',
      on: {
        click: () => {
          try {
            window.localStorage.setItem(HOME_TIP, 'dismissed');
          } catch {
            // Not remembered on this device; it is gone for this visit.
          }
          tip.remove();
        },
      },
    }),
  ]);
  return tip;
}

export async function renderMember(main, ctx) {
  main.replaceChildren(loading());
  let me;
  let rewards;
  let requests;
  let history;
  try {
    [me, rewards, requests, history] = await Promise.all([
      request('/api/me'),
      request('/api/rewards'),
      request('/api/me/redemptions?limit=10'),
      request('/api/me/ledger?limit=10'),
    ]);
  } catch (failure) {
    if (ctx.isCurrent()) ctx.fail(failure);
    return;
  }
  if (!ctx.isCurrent()) return;
  const money = units => formatUnits(units, me.org, getLocale());
  main.replaceChildren(...[
    el('h1', { text: t('me.title'), attrs: { class: 'page-title' } }),
    me.org.welcome ? el('p', { text: me.org.welcome, attrs: { class: 'welcome' } }) : null,
    homeTip(ctx),
    el('div', { attrs: { class: 'me-grid' } }, [
      balanceCard(me, money),
      shelfCard(me),
      benefitsCard(ctx, me, rewards.items, money),
      requestsCard(ctx, requests, money),
      historyCard(ctx, history, money),
    ]),
  ].filter(Boolean));
}
