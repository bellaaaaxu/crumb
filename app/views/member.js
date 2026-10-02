/* One page for a team member: the main tile (balance and shelf), the way to spend, the log,
 * the welcome line. Everything is read for the signed-in person only; there is nothing
 * about anyone else on this page. */

import { keyFor, request, requestAll, settleKey, unconfirmedSince, wasRefused } from '../api.js';
import { button, el, formError, openedAsHomeScreenApp, toast, uid } from '../dom.js';
import { formatDate, getLocale, t } from '../i18n.js';
import { formatUnits, isAlmostThere, unitsToInput } from '../format.js';
import { bump, lastSeen, reducedMotion, rememberSeen, rollNumber } from '../motion.js';
import { pixelNumber, spriteCanvas } from '../pixels.js';
import { openAmountSheet } from '../sheet.js';
import { badge, historyTitle, kindLabel, loading, pager, signedAmount, unconfirmedNotice } from './shared.js';

const SLOTS_PER_ROW = 6;
const RECENT = 5;
const DAILY = 7;
const DAILY_ZERO = 4;

const nameIn = names => names?.[getLocale()] ?? names?.en ?? '';

/* One warm line a day, by the day of the month; a gentler set while the balance is empty. */
function dailyLine(me) {
  const day = new Date().getDate();
  return me.balance.availableUnits > 0 ? t(`daily.${(day % DAILY) + 1}`) : t(`dailyZero.${(day % DAILY_ZERO) + 1}`);
}

/* Splits a template like "{name} is in the oven" around the name, so the name can be bold
 * wherever each language puts it. */
function boldName(key, name) {
  const [before, after] = t(key, { name: '\u0000' }).split('\u0000');
  return [before, el('b', { text: name }), after].filter(part => part !== '');
}

/* ---------------------------------------------------------------- the main tile */

/* The big number: digits only, the currency or unit is the label above it. */
const numberText = (units, org) => (org.mode === 'credit' ? unitsToInput(units, 'credit') : String(units));

/* Rolls the big number from one balance to another, or just draws it when there is no
 * `from`. The cell size is 9 CSS pixels as in the original, smaller when the number would
 * not fit the tile. It is worked out once per roll from the longer of the two numbers: the
 * digits keep one size all the way, and the tile's width is read once, not on every frame. */
function showBalance(canvas, from, to, org) {
  const longest = Math.max(...[from, to].filter(units => units !== undefined).map(units => numberText(units, org).length));
  const cols = longest * 3 + Math.max(0, longest - 1);
  const room = Math.max(160, (canvas.parentElement?.clientWidth || 300) - 24);
  const size = Math.max(4, Math.min(9, Math.floor(room / cols)));
  rollNumber(canvas, from, to, (target, units) => pixelNumber(target, numberText(units, org), size, '#4a2f1b'));
}

function slot(item, dropAt) {
  const name = nameIn(item.names);
  const slotButton = el('button', {
    attrs: { type: 'button', class: 'slot-button', 'aria-label': name },
    on: { click: event => event.currentTarget.classList.toggle('show-name') },
  }, [spriteCanvas(item.spriteKey, 3), el('span', { text: name, attrs: { class: 'slot-name', 'aria-hidden': 'true' } })]);
  slotButton.addEventListener('blur', () => slotButton.classList.remove('show-name'));
  const node = el('li', { attrs: { class: `slot filled${dropAt === null ? '' : ' pop'}` } }, [slotButton]);
  // Set through the style object, which the Content Security Policy allows; a style attribute it would refuse.
  if (dropAt !== null) node.style.animationDelay = `${dropAt * 70}ms`;
  return node;
}

function mainTile(me, money, seen) {
  const { balance, collection, theme, org } = me;
  const filled = collection.length;
  const shown = Math.min(theme.size, Math.max(SLOTS_PER_ROW, Math.ceil((filled + 1) / SLOTS_PER_ROW) * SLOTS_PER_ROW));
  // First visit: every pastry drops. Later: only the ones unlocked since this device last looked.
  // With less motion asked for, none drops: the stylesheet shortens the animation but not the
  // delay, and each slot would stay invisible for its whole delay.
  const dropFrom = reducedMotion() ? filled : Math.min(seen?.count ?? 0, filled);
  const slots = [];
  for (let index = 0; index < shown; index += 1) {
    if (collection[index]) slots.push(slot(collection[index], index >= dropFrom ? index - dropFrom : null));
    else slots.push(el('li', { attrs: { class: 'slot', 'aria-hidden': 'true' } }));
  }
  const canvas = el('canvas', { attrs: { 'aria-hidden': 'true' } });
  const spoken = el('span', { text: money(balance.availableUnits), attrs: { class: 'sr-only', 'data-testid': 'available-balance' } });
  const number = el('div', { attrs: { class: 'big-number' } }, [canvas, spoken]);
  let caption;
  if (theme.complete) caption = el('p', { text: t('me.complete', { total: theme.size }), attrs: { class: 'oven-caption complete' } });
  else caption = el('p', { attrs: { class: 'oven-caption' } }, [spriteCanvas(theme.next.spriteKey, 2), el('span', {}, boldName('me.inOven', nameIn(theme.next.names)))]);
  // The page's one h1, for moving by heading; the tile shows the name, so it is not seen.
  const titleId = uid('me-title');
  const tile = el('section', { attrs: { class: 'tile main-tile', 'aria-labelledby': titleId } }, [
    el('h1', { text: t('me.title'), attrs: { id: titleId, class: 'sr-only' } }),
    el('div', { attrs: { class: 'holder' } }, [el('span', { text: me.user.displayName })]),
    el('p', { text: org.unitLabel, attrs: { class: 'credit-label' } }),
    number,
    el('ul', { attrs: { class: 'slots', 'aria-label': t('me.collection') } }, slots),
    caption,
  ]);
  // Drawn once the tile is in the document, so the canvas knows how wide it may be.
  queueMicrotask(() => {
    showBalance(canvas, seen?.balance, balance.availableUnits, org);
    if (seen && seen.balance !== balance.availableUnits) bump(number, seen.balance > balance.availableUnits ? 'dip' : 'jump');
  });
  return { tile, canvas, number, spoken };
}

/* ---------------------------------------------------------------- spending: self-recorded */

/* The request key belongs to this amount until the server answers, so jotting the same
 * amount again after a lost answer finishes that entry instead of adding a second one.
 *
 * After an entry the page stays as it is: the number rolls to the new balance, then the
 * balance and the log are read again and only they change. Nothing flashes "Loading…", and
 * the keyboard stays on the button the sheet hands it back to. `replaceLog(page)` puts a
 * fresh first page of the log in place of the one shown. */
function spendArea(ctx, me, money, tileParts, replaceLog) {
  const { org } = me;
  const hint = el('p', { text: dailyLine(me), attrs: { class: 'actions-hint' } });
  // What the page was drawn with, apart from the balance. An entry changes none of it; if a
  // reading after one finds any of it changed (a treat, a new pastry, the team's settings),
  // the whole page is drawn again, so the treat is announced and the pastry drops.
  const drawn = { lifetime: me.balance.lifetimeUnits, count: me.collection.length, org: JSON.stringify(me.org) };
  // Everything that follows the balance: the number rolls to it, the screen-reader text says
  // it, and the day's line takes the gentler set at zero. The sheet opens with it next time.
  const moveTo = balance => {
    const from = me.balance.availableUnits;
    me.balance = balance;
    tileParts.spoken.textContent = money(balance.availableUnits);
    hint.textContent = dailyLine(me);
    if (from === balance.availableUnits) return;
    showBalance(tileParts.canvas, from, balance.availableUnits, org);
    bump(tileParts.number, from > balance.availableUnits ? 'dip' : 'jump');
  };
  // Only the newest reading is used: one started before a second entry may predate it.
  let readings = 0;
  const reread = async () => {
    const reading = (readings += 1);
    let fresh;
    let page;
    try {
      // Read while the number rolls; used once it has stopped, so a second roll never cuts in.
      [[fresh, page]] = await Promise.all([
        Promise.all([request('/api/me'), request('/api/me/ledger?limit=25')]),
        new Promise(resolve => { window.setTimeout(resolve, reducedMotion() ? 0 : 700); }),
      ]);
    } catch (failure) {
      // The entry is recorded and the number shows it; only a lost session needs more.
      await ctx.recover(failure);
      return;
    }
    // Not after the person has moved to another page, nor for a reading a later one replaces.
    if (reading !== readings || !ctx.isCurrent()) return;
    if (fresh.balance.lifetimeUnits !== drawn.lifetime || fresh.collection.length !== drawn.count || JSON.stringify(fresh.org) !== drawn.org) {
      ctx.render();
      return;
    }
    moveTo(fresh.balance);
    replaceLog(page);
    rememberSeen(me.user.id, { balance: fresh.balance.availableUnits, count: drawn.count, lifetime: drawn.lifetime });
  };
  const open = () => {
    const earlier = unconfirmedSince('spend');
    openAmountSheet({
      available: me.balance.availableUnits,
      money,
      notice: earlier.length ? unconfirmedNotice('spend.unconfirmed', earlier) : null,
      async onConfirm(units) {
        const action = `spend:${units}`;
        let result;
        try {
          result = await request('/api/me/spend', {
            method: 'POST', body: { amount: unitsToInput(units, org.mode), mode: org.mode }, key: await keyFor(action),
          });
        } catch (failure) {
          if (wasRefused(failure)) await settleKey(action);
          if (await ctx.recover(failure)) return;
          throw new Error(ctx.errorText(failure));
        }
        await settleKey(action);
        toast(t(result.replayed ? 'spend.alreadyDone' : 'spend.done', { amount: money(units) }));
        // The count and lifetime stay as drawn: a treat that came in meanwhile is still
        // announced when the page is next drawn.
        rememberSeen(me.user.id, { balance: result.balance.availableUnits, count: drawn.count, lifetime: drawn.lifetime });
        moveTo(result.balance);
        reread();
      },
    });
  };
  return [
    button(t('me.spend'), { kind: 'primary', attrs: { class: 'btn btn-primary act' }, on: { click: open } }),
    hint,
  ];
}

/* ---------------------------------------------------------------- spending: confirmed */

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
          // Nothing was set aside. Show the page as it is now rather than ask again at the old
          // price, or from a list the team no longer uses.
          if (failure.code === 'PRICE_CHANGED' || failure.code === 'SPENDING_MODE') {
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
  dialog = ctx.openDialog({ title: t('redeem.title', { name: reward.name }), content: form }).dialog;
}

/* The icon is one of the theme's pastries. A key a later theme no longer has draws nothing,
 * so the row goes without an icon rather than keep an empty box. */
function benefitIcon(iconKey) {
  if (!iconKey) return null;
  const drawing = spriteCanvas(iconKey, 3);
  return drawing.hidden ? null : el('span', { attrs: { class: 'row-icon' } }, [drawing]);
}

function benefitRow(ctx, me, reward, money) {
  const affordable = me.balance.availableUnits >= reward.costUnits;
  const titleId = uid('benefit');
  return el('li', { attrs: { class: 'row benefit' } }, [
    benefitIcon(reward.iconKey),
    el('div', { attrs: { class: 'row-main' } }, [
      el('p', { text: reward.name, attrs: { class: 'row-title', id: titleId } }),
      reward.description ? el('p', { text: reward.description, attrs: { class: 'muted small' } }) : null,
      // Only when the member is close; further off, the price and the unavailable button say enough.
      isAlmostThere(me.balance.availableUnits, reward.costUnits)
        ? el('p', { text: t('me.notEnough'), attrs: { class: 'muted small' } })
        : null,
    ]),
    el('p', { text: money(reward.costUnits), attrs: { class: 'price' } }),
    // The button's name stays its visible words, so a voice command that
    // reads them out matches; the benefit comes through as the description.
    button(t('me.redeem'), {
      kind: 'primary',
      attrs: { 'aria-describedby': titleId, disabled: !affordable },
      on: { click: () => confirmRedeem(ctx, me, reward, money) },
    }),
  ]);
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

/* "Your requests", or nothing when there are none. */
function requestsTile(ctx, requests, money) {
  if (!requests.items.length) return null;
  const toRow = item => requestRow(ctx, item, money);
  const list = el('ul', { attrs: { class: 'rows' } }, requests.items.map(toRow));
  const requestsTitle = uid('requests');
  return el('section', { attrs: { class: 'tile', 'aria-labelledby': requestsTitle } }, [
    el('h2', { text: t('me.requests'), attrs: { id: requestsTitle, class: 'tile-title' } }),
    list,
    pager(ctx, list, requests, cursor => `/api/me/redemptions?limit=10&cursor=${encodeURIComponent(cursor)}`, toRow),
  ]);
}

/* The benefits tile, the daily line, and "Your requests" when there are any. */
function confirmArea(ctx, me, rewards, requests, money) {
  const benefitsTitle = uid('benefits');
  return [
    el('section', { attrs: { class: 'tile', 'aria-labelledby': benefitsTitle } }, [
      el('h2', { text: t('me.benefits'), attrs: { id: benefitsTitle, class: 'tile-title' } }),
      rewards.length
        ? el('ul', { attrs: { class: 'rows' } }, rewards.map(reward => benefitRow(ctx, me, reward, money)))
        : el('p', { text: t('me.noBenefits'), attrs: { class: 'muted' } }),
    ]),
    el('p', { text: dailyLine(me), attrs: { class: 'actions-hint' } }),
    requestsTile(ctx, requests, money),
  ];
}

/* ---------------------------------------------------------------- the log */

const monthOf = iso => new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'long' }).format(new Date(iso));

/* A row a manager put right, or a redemption given back. A refund is not a mistake, so it
 * has its own flag and badge rather than sharing "corrected". */
function rowBadge(item) {
  if (item.kind === 'grant' && item.revoked) return badge('revoked');
  if (item.kind === 'spend' && item.corrected) return badge('voided');
  if (item.kind === 'redeem' && item.refunded) return badge('refunded');
  return null;
}

function logRow(item, money, { expanded }) {
  const plus = item.deltaUnits > 0;
  return el('li', { attrs: { class: `rec log-${item.kind}` } }, [
    el('span', { attrs: { class: `rec-diamond ${plus ? 'plus' : 'minus'}`, 'aria-hidden': 'true' } }),
    el('span', { text: signedAmount(item.deltaUnits, money), attrs: { class: `rec-amt ${plus ? 'plus' : 'minus'}` } }),
    el('span', { text: expanded ? historyTitle(item) : kindLabel(item.kind), attrs: { class: 'rec-label' } }),
    el('span', { text: formatDate(item.createdAt), attrs: { class: 'rec-time' } }),
    rowBadge(item),
    // A treat's message only in the expanded log: the recent rows stay four things long.
    expanded && item.reason ? el('p', { text: item.reason, attrs: { class: 'rec-note' } }) : null,
  ]);
}

/* "Log · Recent" shows the latest five rows. "See all" expands them by month and pages on.
 * `open` starts it expanded: a log read again after an entry stays as the person left it. */
function questLog(ctx, page, money, { open: startOpen = false } = {}) {
  const items = page.items;
  let open = startOpen && items.length > 0;
  const bodyId = uid('log');
  const body = el('div', { attrs: { class: 'quest-body', id: bodyId } });
  const toggleLabel = el('span', { attrs: { class: 'toggle' } });
  const title = el('span', { attrs: { class: 'title' } });
  const paint = () => {
    title.textContent = t(open ? 'me.logAll' : 'me.logRecent');
    toggleLabel.replaceChildren(el('span', { text: t(open ? 'me.collapse' : 'me.seeAll') }), el('span', { text: '⌄', attrs: { class: 'chev', 'aria-hidden': 'true' } }));
    // A new list each time: a "Show more" still loading from an earlier expansion then adds
    // its rows to a list no longer on the page, never to the recent view or a second copy.
    const list = el('ul', { attrs: { class: 'rows' } });
    if (!items.length) {
      body.replaceChildren(el('p', { text: t('me.logEmpty'), attrs: { class: 'quest-empty' } }));
      return;
    }
    if (!open) {
      list.append(...items.slice(0, RECENT).map(item => logRow(item, money, { expanded: false })));
      body.replaceChildren(list);
      return;
    }
    let month = null;
    const toRow = item => logRow(item, money, { expanded: true });
    const withMonths = item => {
      const label = monthOf(item.createdAt);
      const nodes = [];
      if (label !== month) {
        month = label;
        nodes.push(el('li', { text: label, attrs: { class: 'quest-month' } }));
      }
      nodes.push(toRow(item));
      return nodes;
    };
    list.append(...items.flatMap(withMonths));
    const more = pager(ctx, list, page, cursor => `/api/me/ledger?limit=25&cursor=${encodeURIComponent(cursor)}`, item => {
      // Appended pages keep the month headings going.
      const nodes = withMonths(item);
      list.append(...nodes.slice(0, -1));
      return nodes.at(-1);
    });
    // No further page means no button: replaceChildren would print a null as the word "null".
    body.replaceChildren(...[list, more].filter(Boolean));
  };
  const head = el('button', {
    attrs: { type: 'button', class: 'quest-head', 'aria-expanded': String(open), 'aria-controls': bodyId, disabled: !items.length },
    on: { click: () => { open = !open; head.setAttribute('aria-expanded', String(open)); quest.classList.toggle('open', open); paint(); } },
  }, [el('span', { attrs: { class: 'dot', 'aria-hidden': 'true' } }), title, items.length ? toggleLabel : null]);
  const quest = el('section', { attrs: { class: open ? 'quest open' : 'quest', 'aria-label': t('me.log') } }, [head, body]);
  paint();
  return quest;
}

/* ---------------------------------------------------------------- the home-screen tip */

const HOME_TIP = 'crumb.homeTip';

/* A team member comes in through a one-time link or code, so an icon on the home screen is
 * how they come back. Shown until dismissed on this device, and never inside that icon. */
function homeTip(ctx) {
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(HOME_TIP) === 'dismissed';
  } catch {
    // storage blocked: show it; dismissing still hides it for this visit
  }
  if (ctx.user.role !== 'member' || dismissed || openedAsHomeScreenApp()) return null;
  const titleId = uid('home-tip');
  const tip = el('section', { attrs: { class: 'home-tip', 'aria-labelledby': titleId } }, [
    el('h2', { text: t('home.title'), attrs: { id: titleId, class: 'tile-title' } }),
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
            // not remembered on this device
          }
          tip.remove();
          // The button is gone with the tip: keep the keyboard on the page.
          document.getElementById('main')?.focus();
        },
      },
    }),
  ]);
  return tip;
}

/* ---------------------------------------------------------------- the page */

export async function renderMember(main, ctx) {
  main.classList.add('member-page');
  main.replaceChildren(loading());
  let me;
  let history;
  // Confirmed spending needs the benefits and a page of requests; self-recorded spending only
  // the requests still waiting.
  let rewards;
  let requests;
  let waiting;
  try {
    [me, history] = await Promise.all([request('/api/me'), request('/api/me/ledger?limit=25')]);
    if (me.org.spending === 'confirm') [rewards, requests] = await Promise.all([request('/api/rewards'), request('/api/me/redemptions?limit=10')]);
    // Requests still waiting after a switch to self-recording: every one of them, however
    // many finished ones came after it.
    else waiting = await requestAll('/api/me/redemptions?status=pending');
  } catch (failure) {
    if (ctx.isCurrent()) ctx.fail(failure);
    return;
  }
  if (!ctx.isCurrent()) return;
  const money = units => formatUnits(units, me.org, getLocale());
  const seen = lastSeen(me.user.id);
  const tileParts = mainTile(me, money, seen);
  if (ctx.entering) tileParts.tile.classList.add('enter');
  let log = questLog(ctx, history, money);
  const replaceLog = page => {
    const next = questLog(ctx, page, money, { open: log.classList.contains('open') });
    const hadFocus = log.contains(document.activeElement);
    log.replaceWith(next);
    log = next;
    if (hadFocus) next.querySelector('.quest-head').focus();
  };
  const spending = me.org.spending === 'self'
    ? spendArea(ctx, me, money, tileParts, replaceLog)
    : confirmArea(ctx, me, rewards.items, requests, money);
  // After a switch to self-recording, requests still waiting keep their tile until resolved:
  // only "Your requests" of the confirmed area, without the benefits and the daily line. All
  // of them are loaded, so there is no further page.
  const leftovers = me.org.spending === 'self'
    ? requestsTile(ctx, { items: waiting, nextCursor: null }, money)
    : null;
  main.replaceChildren(...[
    homeTip(ctx),
    tileParts.tile,
    ...spending,
    leftovers,
    log,
    me.org.welcome ? el('p', { text: me.org.welcome, attrs: { class: 'daily' } }) : null,
  ].filter(Boolean));
  // Treats that arrived since this device last looked: the number jumps, and a line says so.
  if (seen && me.balance.lifetimeUnits > seen.lifetime) toast(t('me.treated', { amount: money(me.balance.lifetimeUnits - seen.lifetime) }));
  rememberSeen(me.user.id, { balance: me.balance.availableUnits, count: me.collection.length, lifetime: me.balance.lifetimeUnits });
}
