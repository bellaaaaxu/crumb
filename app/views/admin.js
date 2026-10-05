/* The Team page for owners and admins: give a treat, what is waiting, people, benefits (in
 * confirmed mode), and the log; for admins, who have no Settings, also the activity log, to
 * read only. The server re-checks every permission; hiding a button here is a courtesy, not
 * the control. */

import { keyFor, request, requestAll, settleKey, unconfirmedSince, wasRefused } from '../api.js';
import { button, copyText, el, field, formError, radios, toast, uid } from '../dom.js';
import { formatDate, formatDateTime, getLocale, t, themed } from '../i18n.js';
import { amountToUnits, formatUnits, unitsToInput } from '../format.js';
import { spriteCanvas } from '../pixels.js';
import { actionDialog, badge, historyTitle, loading, oneTap, pager, section, signedAmount, unconfirmedNotice } from './shared.js';
import { activitySection } from './activity.js';

const moneyFor = org => units => formatUnits(units, org, getLocale());
const amountHint = org => t(org.mode === 'credit' ? 'amount.creditHint' : 'amount.pointsHint', { currency: org.currency, unit: org.unitLabel });
const amountError = org => t(org.mode === 'credit' ? 'amount.creditError' : 'amount.pointsError');
const LOG_PAGE = 20;

/* ---------------------------------------------------------------- treats */

async function openGrant(ctx, done) {
  let members;
  try {
    members = await requestAll('/api/admin/members?status=active');
  } catch (failure) {
    ctx.fail(failure);
    return;
  }
  const { org } = ctx;
  const money = moneyFor(org);
  members.sort((a, b) => a.displayName.localeCompare(b.displayName, getLocale()));
  const boxes = members.map(person => {
    const id = uid('to');
    const input = el('input', { attrs: { type: 'checkbox', id, value: person.id } });
    const label = person.id === ctx.user.id ? t('grant.you', { name: person.displayName }) : person.displayName;
    const role = person.role === 'member' ? '' : ` · ${t(`role.${person.role}`)}`;
    return { input, node: el('li', {}, [el('div', { attrs: { class: 'checkbox' } }, [input, el('label', { text: `${label}${role}`, attrs: { for: id } })])]) };
  });
  const chosen = () => boxes.filter(box => box.input.checked).map(box => box.input.value);
  const whoErrorId = uid('who-error');
  const whoError = el('p', { attrs: { id: whoErrorId, class: 'field-error', hidden: true } });
  const legendId = uid('who');
  const who = el('div', { attrs: { class: 'field', role: 'group', 'aria-labelledby': legendId, 'aria-describedby': whoErrorId } }, [
    el('span', { text: t('grant.who'), attrs: { id: legendId, class: 'field-label' } }),
    el('div', { attrs: { class: 'check-actions' } }, [
      button(t('grant.selectAll'), { kind: 'quiet', on: { click: () => { for (const box of boxes) box.input.checked = true; paint(); } } }),
      button(t('grant.selectNone'), { kind: 'quiet', on: { click: () => { for (const box of boxes) box.input.checked = false; paint(); } } }),
    ]),
    el('ul', { attrs: { class: 'check-list' } }, boxes.map(box => box.node)),
    whoError,
  ]);
  const amount = field({ label: t('grant.amountEach'), name: 'amount', hint: amountHint(org), attrs: { inputmode: org.mode === 'credit' ? 'decimal' : 'numeric', autocomplete: 'off' } });
  const message = field({ label: t('grant.message'), name: 'reason', multiline: true, hint: t('grant.messageHint'), attrs: { maxlength: 500 } });
  const earlier = unconfirmedSince('grant');
  let submit;
  // The button says how many people and what it comes to in all, once both are known.
  const paint = () => {
    const count = chosen().length;
    const units = amountToUnits(amount.control.value.trim(), org.mode);
    if (!submit) return;
    submit.textContent = count > 1 && units !== null
      ? t('grant.sendMany', { count, total: money(units * count) })
      : t('grant.send');
  };
  for (const box of boxes) box.input.addEventListener('change', paint);
  amount.control.addEventListener('input', paint);
  const opened = actionDialog(ctx, {
    title: t('grant.title'),
    intro: earlier.length ? [unconfirmedNotice('grant.unconfirmed', earlier)] : [],
    fields: [amount, message],
    extra: [],
    submitLabel: t('grant.send'),
    validate() {
      whoError.hidden = true;
      if (!chosen().length) {
        whoError.textContent = t('grant.chooseError');
        whoError.hidden = false;
        boxes[0]?.input.focus();
        return false;
      }
      if (amountToUnits(amount.control.value.trim(), org.mode) === null) {
        amount.setError(amountError(org));
        amount.control.focus();
        return false;
      }
      return true;
    },
    // The same people (in any order), amount and message are the same treat: its key is kept.
    action: () => `grant:${chosen().sort().join(',')}:${amountToUnits(amount.control.value.trim(), org.mode)}:${message.control.value.trim()}`,
    send(key) {
      const ids = chosen();
      const body = { amount: amount.control.value.trim(), mode: org.mode, reason: message.control.value };
      return ids.length === 1
        ? request('/api/admin/grants', { method: 'POST', key, body: { ...body, userId: ids[0] } })
        : request('/api/admin/grants/batch', { method: 'POST', key, body: { ...body, userIds: ids } });
    },
    done(result) {
      // The line about what came out of the oven names the collection, so it follows the team's theme.
      const themeId = org.theme;
      if (result.entries) {
        const params = { count: result.count, amount: money(result.units) };
        if (result.replayed) toast(t('grant.alreadySentMany'));
        else toast(result.unlocked ? `${t('grant.sentMany', params)} ${themed('grant.unlocked', themeId, { count: result.unlocked })}` : t('grant.sentMany', params));
      } else {
        const person = members.find(item => item.id === result.entry.userId);
        const params = { amount: money(result.entry.deltaUnits), name: person?.displayName ?? '' };
        if (result.replayed) toast(t('grant.alreadySent', params));
        else toast(result.unlocked.length ? `${t('grant.sent', params)} ${themed('grant.unlocked', themeId, { count: result.unlocked.length })}` : t('grant.sent', params));
      }
      done();
    },
  });
  // The list of people goes above the amount: insert it before the first field.
  opened.dialog.querySelector('form').insertBefore(who, amount.wrapper);
  submit = opened.submit;
  paint();
  boxes[0]?.input.focus();
}

/* ---------------------------------------------------------------- waiting (confirmed mode) */

function waitingSection(ctx, pending, money) {
  const complete = async item => {
    const action = `complete:${item.id}`;
    try {
      await request(`/api/admin/redemptions/${item.id}/complete`, { method: 'POST', key: await keyFor(action) });
    } catch (failure) {
      if (wasRefused(failure)) await settleKey(action);
      ctx.fail(failure);
      return;
    }
    await settleKey(action);
    toast(t('redemptions.completedToast', { reward: item.rewardName, name: item.member.displayName }));
    ctx.render();
  };
  const decline = item => {
    const reason = field({ label: t('common.reason'), name: 'reason', multiline: true, hint: t('redemptions.declineHint', { name: item.member.displayName }), attrs: { maxlength: 500 } });
    actionDialog(ctx, {
      title: t('redemptions.declineTitle', { reward: item.rewardName, name: item.member.displayName }),
      fields: [reason], submitLabel: t('redemptions.declineSubmit'), danger: true,
      action: () => `reject:${item.id}:${reason.control.value.trim()}`,
      send: key => request(`/api/admin/redemptions/${item.id}/reject`, { method: 'POST', key, body: { reason: reason.control.value } }),
      done() { toast(t('redemptions.declined', { reward: item.rewardName })); ctx.render(); },
    });
  };
  // For a request the member withdrew in person: it ends as "cancelled", not "declined".
  const cancel = item => actionDialog(ctx, {
    title: t('redemptions.cancelTitle', { reward: item.rewardName, name: item.member.displayName }),
    intro: [t('redemptions.cancelExplain', { name: item.member.displayName, amount: money(item.costUnits) })],
    submitLabel: t('redemptions.cancelSubmit'),
    action: () => `cancel:${item.id}`,
    send: key => request(`/api/redemptions/${item.id}/cancel`, { method: 'POST', key }),
    done() { toast(t('redemptions.cancelled', { reward: item.rewardName })); ctx.render(); },
  });
  // Each row's buttons are described by its title, so "Confirm" says which request.
  const rows = pending.map(item => {
    const titleId = uid('request');
    const about = { 'aria-describedby': titleId };
    return el('li', { attrs: { class: 'row' } }, [
      el('div', { attrs: { class: 'row-main' } }, [
        el('p', { text: t('redemptions.line', { reward: item.rewardName, name: item.member.displayName }), attrs: { class: 'row-title', id: titleId } }),
        el('p', { text: `${money(item.costUnits)} · ${formatDateTime(item.createdAt)}`, attrs: { class: 'muted small' } }),
      ]),
      el('div', { attrs: { class: 'row-actions' } }, [
        button(t('redemptions.confirm'), { kind: 'primary', attrs: about, on: { click: () => complete(item) } }),
        button(t('redemptions.decline'), { attrs: about, on: { click: () => decline(item) } }),
        button(t('redemptions.cancelRequest'), { kind: 'quiet', attrs: about, on: { click: () => cancel(item) } }),
      ]),
    ]);
  });
  return section(t('team.waiting'), [
    el('p', { text: t('redemptions.confirmHint'), attrs: { class: 'muted small' } }),
    rows.length ? el('ul', { attrs: { class: 'rows' } }, rows) : el('p', { text: t('team.nothingWaiting'), attrs: { class: 'muted' } }),
  ], { className: 'wide' });
}

/* ---------------------------------------------------------------- members */

/* A QR code the server made for a link: only ever a PNG data URL. */
const QR_SHAPE = /^data:image[/]png;base64,[A-Za-z0-9+/]+=*$/;

/* The picture as a file, decoded here: fetching a data: URL would need a wider connect-src. */
function pngFile(dataUrl, name) {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), char => char.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

/* The link as a QR code: scanned from this screen in person, or sent as a picture, which a
 * phone opens with a long press. Saving always works, and is what goes into a chat on a
 * computer; where the system can share files (phones, and some computers) sharing is offered
 * too, and falls back to saving if it fails. */
function qrBlock(qr, name, fileName) {
  const file = pngFile(qr, fileName);
  const save = () => {
    const anchor = el('a', { attrs: { href: qr, download: fileName, hidden: true } });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const share = canShare ? button(t('members.qrShare'), {
    on: {
      click: async () => {
        try {
          await navigator.share({ files: [file] });
        } catch (error) {
          // Closing the share sheet is a choice; anything else, save it instead.
          if (error?.name !== 'AbortError') save();
        }
      },
    },
  }) : null;
  return el('figure', { attrs: { class: 'qr' } }, [
    el('img', { attrs: { src: qr, alt: t('members.qrAlt', { name }), class: 'qr-image', width: 240, height: 240 } }),
    el('figcaption', { text: t('members.qrCaption', { name }), attrs: { class: 'small' } }),
    el('div', { attrs: { class: 'row-actions' } }, [button(t('members.qrSave'), { on: { click: save } }), share]),
  ]);
}

/* The QR code if it is one the server made and it reads as a picture; otherwise the link alone. */
function qrOrNothing(qr, name, fileName) {
  if (typeof qr !== 'string' || !QR_SHAPE.test(qr)) return null;
  try {
    return qrBlock(qr, name, fileName);
  } catch {
    return null;
  }
}

/* What the panel needs to show a link's QR code for a person. */
const qrFor = (result, person) => ({ qr: result.qr, name: person.displayName, fileName: `crumb-${person.username}.png` });

/* One-time links are shown once, with a copy button, and can be dismissed. `back` is where
 * the keyboard goes when it is: the control the panel belongs to, or else the page. */
function linkPanel(label, url, note, { qr = null, name = '', fileName = 'crumb.png', back = null } = {}) {
  const link = field({ label, name: 'link', value: url, attrs: { readonly: true, class: 'link-input' } });
  const panel = el('div', { attrs: { class: 'link-panel' } }, [
    qrOrNothing(qr, name, fileName),
    link.wrapper,
    el('p', { text: note, attrs: { class: 'muted small' } }),
    el('div', { attrs: { class: 'row-actions' } }, [
      button(t('common.copy'), {
        on: {
          click: async () => {
            try {
              await copyText(url);
              toast(t('common.copied'));
            } catch {
              link.control.select();
              toast(t('common.copyManually'));
            }
          },
        },
      }),
      button(t('common.done'), {
        kind: 'quiet',
        on: {
          click: () => {
            panel.remove();
            // The button is gone with the panel: keep the keyboard on the page.
            (back?.isConnected ? back : document.getElementById('main'))?.focus();
          },
        },
      }),
    ]),
  ]);
  return panel;
}

function changeRole(ctx, person, refresh) {
  // The member's line names the collection, so it follows the team's theme; the other roles
  // have no theme version and keep their base line.
  const choice = radios({
    legend: t('members.role'), name: 'role', value: person.role,
    options: ['member', 'admin', 'owner'].map(value => ({ value, label: t(`role.${value}`), detail: themed(`members.roleDetail.${value}`, ctx.org.theme) })),
  });
  const same = formError();
  actionDialog(ctx, {
    title: t('members.roleTitle', { name: person.displayName }),
    extra: [choice.fieldset, same.node],
    submitLabel: t('members.changeRole'),
    validate() {
      same.clear();
      if (choice.value !== person.role) return true;
      same.show(t('members.roleSame'));
      return false;
    },
    action: () => `role:${person.id}:${choice.value}`,
    send: key => request(`/api/admin/members/${person.id}`, { method: 'PATCH', body: { role: choice.value }, key }),
    done(updated) {
      const changed = t('members.roleChanged', { name: person.displayName, role: t(`role.${updated.role}`) });
      // The server ends links made for the old role, and signs the person out. Team members
      // sign in with a personal link, owners and admins with a password: say what they need now.
      // (Someone deactivated needs nothing yet; reactivating them says what to do.)
      const name = person.displayName;
      let next = null;
      if (updated.status === 'invited') next = t('members.roleNewLink');
      else if (updated.status === 'active') {
        if (updated.role === 'member') next = t('members.roleNowLink', { name });
        else if (person.role === 'member') next = t('members.roleNowPassword', { name });
        else next = t('members.roleSignedOut', { name });
      }
      toast(next ? `${changed} ${next}` : changed);
      refresh();
    },
  });
}

/* A change made from a person's open row (role, deactivate, reactivate) draws the page again;
 * that draw opens the row again and puts the keyboard on it, not back at the top of the page.
 * Read, and cleared, as the page starts to draw. */
let reopenPerson = null;

/* A person on the Team page. The row says who they are and what they have; it is a button
 * that opens their actions and, under them, any link just made for them, so a long team
 * stays short on a phone. `single` keeps one person open at a time. Someone this manager
 * can do nothing about (themselves, or an owner or admin when an admin is looking) gets the
 * same row with nothing to open. */
function memberRow(ctx, person, money, refresh, single, reopen = false) {
  const self = person.id === ctx.user.id;
  const manageable = !self && (ctx.user.role === 'owner' || person.role === 'member');
  const actions = [];
  const memberPath = `/api/admin/members/${person.id}`;
  const teamMember = person.role === 'member';
  const redraw = () => {
    reopenPerson = person.id;
    refresh();
  };
  const panelId = uid('person');
  const nameId = uid('person-name');
  const factsId = uid('person-facts');
  const statusId = uid('person-status');
  // Named by the person's name alone, as its words start; the rest of the row describes it.
  const toggle = el('button', {
    attrs: { type: 'button', class: 'person', 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-labelledby': nameId, 'aria-describedby': `${statusId} ${factsId}` },
  });
  const linkArea = el('div', { attrs: { class: 'link-area', 'aria-live': 'polite' } });
  const showLink = panel => linkArea.replaceChildren(panel);
  // Done on a link panel puts the keyboard back on the person's row.
  const panelFor = result => ({ ...qrFor(result, person), back: toggle });
  // A team member's only way in is their personal link. A new one signs them out everywhere
  // at once (that is how a lost phone is cut off), so like deactivating it asks first.
  if (manageable && teamMember && person.status !== 'deactivated') {
    actions.push(button(t('members.newSigninLink'), {
      attrs: { 'aria-label': t('members.newSigninLinkNamed', { name: person.displayName }) },
      on: {
        click: () => actionDialog(ctx, {
          title: t('members.newSigninTitle', { name: person.displayName }),
          intro: [t('members.newSigninExplain')],
          submitLabel: t('members.newSigninConfirm'),
          action: () => `signin:${person.id}`,
          send: key => request(`${memberPath}/signin-link`, { method: 'POST', key }),
          // Whether they had joined comes from the server: this list may be older than that.
          done: result => showLink(linkPanel(t('members.signinLink'), result.signinUrl,
            t(result.user.status === 'active' ? 'members.signinRenewNote' : 'members.signinNote', { name: person.displayName }),
            panelFor(result))),
        }),
      },
    }));
  }
  if (manageable && !teamMember && person.status === 'invited') {
    actions.push(button(t('members.newInvite'), {
      attrs: { 'aria-label': t('members.newInviteNamed', { name: person.displayName }) },
      on: {
        click: () => oneTap(ctx, `invite:${person.id}`, { path: `${memberPath}/invitation` },
          result => showLink(linkPanel(t('members.inviteLink'), result.invitationUrl, t('members.inviteNote', { name: person.displayName }),
            panelFor(result)))),
      },
    }));
  }
  if (manageable && !teamMember && person.status === 'active') {
    actions.push(button(t('members.resetLink'), {
      attrs: { 'aria-label': t('members.resetLinkNamed', { name: person.displayName }) },
      on: {
        click: () => oneTap(ctx, `reset:${person.id}`, { path: `${memberPath}/reset` },
          result => showLink(linkPanel(t('members.resetLinkLabel'), result.resetUrl, t('members.resetNote', { name: person.displayName }),
            panelFor(result)))),
      },
    }));
  }
  if (manageable && person.status !== 'deactivated') {
    actions.push(button(t('members.deactivate'), {
      kind: 'danger',
      attrs: { 'aria-label': t('members.deactivateNamed', { name: person.displayName }) },
      on: {
        click: () => actionDialog(ctx, {
          title: t('members.deactivateTitle', { name: person.displayName }),
          intro: [t('members.deactivateExplain')],
          submitLabel: t('members.deactivate'),
          danger: true,
          action: () => `deactivate:${person.id}`,
          send: key => request(`/api/admin/members/${person.id}`, { method: 'PATCH', body: { active: false }, key }),
          done() {
            toast(t('members.deactivated', { name: person.displayName }));
            redraw();
          },
        }),
      },
    }));
  }
  if (manageable && person.status === 'deactivated') {
    actions.push(button(t('members.reactivate'), {
      attrs: { 'aria-label': t('members.reactivateNamed', { name: person.displayName }) },
      on: {
        click: () => oneTap(ctx, `reactivate:${person.id}`, { method: 'PATCH', path: memberPath, body: { active: true } }, updated => {
          // Deactivating ended their sessions and links: a team member needs a new sign-in link,
          // and someone who never joined a new invitation.
          const back = t('members.reactivated', { name: person.displayName });
          let next = null;
          if (updated.role === 'member') next = t('members.reactivatedLink');
          else if (updated.status === 'invited') next = t('members.reactivatedInvite');
          toast(next ? `${back} ${next}` : back);
          redraw();
        }),
      },
    }));
  }
  // A role changes only through a dialog with a clear confirm: a picker that saved on every
  // arrow key could turn a member into an owner by accident.
  if (ctx.user.role === 'owner' && !self) {
    actions.unshift(button(t('members.changeRole'), {
      attrs: { 'aria-label': t('members.changeRoleNamed', { name: person.displayName }) },
      on: { click: () => changeRole(ctx, person, redraw) },
    }));
  }
  const status = badge(`member-${person.status}`);
  status.id = statusId;
  const summary = [
    el('span', { attrs: { class: 'person-head' } }, [
      el('span', { text: self ? t('members.youLabel', { name: person.displayName }) : person.displayName, attrs: { id: nameId, class: 'person-name' } }),
      status,
    ]),
    el('span', { attrs: { id: factsId, class: 'person-facts' } }, [
      el('span', { text: `${t(`role.${person.role}`)} · @${person.username}` }),
      el('span', { text: ` · ${t('members.available', { amount: money(person.balance.availableUnits) })}` }),
      el('span', { text: ` · ${t('me.lifetime')} ${money(person.balance.lifetimeUnits)}` }),
    ]),
  ];
  if (!actions.length) return el('li', { attrs: { class: 'row member-row' } }, [el('div', { attrs: { class: 'person' } }, summary)]);
  toggle.append(...summary);
  const panel = el('div', { attrs: { id: panelId, class: 'person-panel', hidden: true } }, [
    el('div', { attrs: { class: 'row-actions' } }, actions),
    linkArea,
  ]);
  const show = open => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  };
  const close = () => show(false);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    // Opening one person closes whoever was open; the keyboard stays on the row pressed.
    if (open && single.close !== close) single.close?.();
    single.close = open ? close : null;
    show(open);
  });
  if (reopen) {
    single.close = close;
    show(true);
  }
  return el('li', { attrs: { class: 'row member-row' } }, [toggle, panel]);
}

/* ---------------------------------------------------------------- people */

function peopleSection(ctx, people, money, reopen = null) {
  const listArea = el('div', { attrs: { class: 'list-area' } });
  // The link for someone just invited shows here, under the form; a link made from a person's
  // row shows in that row.
  const linkArea = el('div', { attrs: { class: 'link-area', 'aria-live': 'polite' } });
  const showLink = panel => linkArea.replaceChildren(panel);
  const refresh = () => ctx.render();
  const single = { close: null };
  const drawList = (list, opening = null) => {
    single.close = null;
    list.sort((a, b) => a.displayName.localeCompare(b.displayName, getLocale()));
    listArea.replaceChildren(el('ul', { attrs: { class: 'rows' } }, list.map(person => memberRow(ctx, person, money, refresh, single, person.id === opening))));
  };
  drawList(people, reopen);

  const name = field({ label: t('members.name'), name: 'displayName', attrs: { maxlength: 80, autocomplete: 'off' } });
  const username = field({ label: t('auth.username'), name: 'username', hint: t('setup.usernameHint'), attrs: { autocapitalize: 'none', spellcheck: 'false', autocomplete: 'off' } });
  const roles = ctx.user.role === 'owner' ? ['member', 'admin', 'owner'] : ['member'];
  const role = field({ label: t('members.role'), name: 'role', value: 'member', options: roles.map(value => ({ value, label: t(`role.${value}`) })) });
  const error = formError();
  const create = button(t('members.create'), { kind: 'primary', type: 'submit' });
  const form = el('form', {
    attrs: { class: 'stack invite-form', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        name.setError();
        username.setError();
        const handle = username.control.value.trim().toLowerCase();
        if (!name.control.value.trim()) { name.setError(t('form.required')); name.control.focus(); return; }
        if (!/^[a-z0-9._-]{3,64}$/.test(handle)) { username.setError(t('setup.usernameHint')); username.control.focus(); return; }
        create.disabled = true;
        try {
          const result = await request('/api/admin/invitations', { method: 'POST', body: { displayName: name.control.value, username: handle, role: role.control.value } });
          showLink(result.signinUrl
            ? linkPanel(t('members.signinLink'), result.signinUrl, t('members.signinNote', { name: result.user.displayName }), qrFor(result, result.user))
            : linkPanel(t('members.inviteLink'), result.invitationUrl, t('members.inviteNote', { name: result.user.displayName }), qrFor(result, result.user)));
          form.reset();
          // Only the list is drawn again: a full render would take the new link away with it.
          drawList(await requestAll('/api/admin/members'));
        } catch (failure) {
          if (failure.code === 'USERNAME_TAKEN') username.setError(ctx.errorText(failure));
          else ctx.fail(failure, error);
        } finally {
          create.disabled = false;
        }
      },
    },
  }, [name.wrapper, username.wrapper, role.wrapper, error.node, create]);
  const invite = el('details', { attrs: { class: 'invite' } }, [
    el('summary', { text: t('members.invite'), attrs: { class: 'btn btn-secondary' } }),
    el('p', { text: t('members.inviteIntro'), attrs: { class: 'muted small' } }),
    form,
  ]);
  return section(t('team.people'), [invite, linkArea, listArea], { className: 'wide' });
}

/* ---------------------------------------------------------------- benefits (confirmed mode) */

/* A pastry's name in the interface's language, from the theme the server sent (the sprite
 * table's own names are Traditional Chinese); the key stands in for one it does not name. */
const pastryName = (theme, key) => theme.names?.[key]?.[getLocale() === 'zh-CN' ? 'zh-CN' : 'en'] ?? key;

/* One of the theme's pastries as a benefit's icon, or none. `theme` is { keys, names } from
 * GET /api/admin/rewards: exactly the keys the server accepts. */
function iconPicker(current, theme) {
  const name = uid('icon');
  const keys = ['', ...theme.keys];
  const inputs = [];
  const options = keys.map(key => {
    const id = uid('icon-option');
    const input = el('input', { attrs: { type: 'radio', name, id, value: key, checked: (current ?? '') === key, 'aria-label': key ? t('benefits.iconNamed', { name: pastryName(theme, key) }) : t('benefits.noIcon') } });
    inputs.push(input);
    return el('label', { attrs: { for: id } }, [input, el('span', { attrs: { class: 'slot' } }, [key ? spriteCanvas(key, 2) : el('span', { text: '—', attrs: { 'aria-hidden': 'true' } })])]);
  });
  const legendId = uid('icon-legend');
  const node = el('div', { attrs: { class: 'field', role: 'radiogroup', 'aria-labelledby': legendId } }, [
    el('span', { text: t('benefits.icon'), attrs: { id: legendId, class: 'field-label' } }),
    el('div', { attrs: { class: 'icon-picker' } }, options),
  ]);
  return { node, get value() { return inputs.find(input => input.checked)?.value || null; } };
}

function benefitFields(org, theme, reward = {}) {
  const name = field({ label: t('benefits.name'), name: 'name', value: reward.name ?? '', attrs: { maxlength: 80 } });
  const description = field({ label: t('benefits.description'), name: 'description', multiline: true, value: reward.description ?? '', attrs: { maxlength: 500 } });
  const price = field({
    label: t('benefits.price'), name: 'amount', hint: amountHint(org),
    value: reward.costUnits ? unitsToInput(reward.costUnits, org.mode) : '',
    attrs: { inputmode: org.mode === 'credit' ? 'decimal' : 'numeric', autocomplete: 'off' },
  });
  const icon = iconPicker(reward.iconKey ?? null, theme);
  const openId = uid('open');
  const open = el('input', { attrs: { type: 'checkbox', id: openId, checked: reward.active ?? true } });
  const openWrapper = el('div', { attrs: { class: 'checkbox' } }, [open, el('label', { text: t('benefits.open'), attrs: { for: openId } })]);
  const validate = () => {
    let ok = true;
    if (!name.control.value.trim()) { name.setError(t('form.required')); ok = false; }
    if (amountToUnits(price.control.value.trim(), org.mode) === null) { price.setError(amountError(org)); ok = false; }
    if (!ok) (name.control.getAttribute('aria-invalid') ? name : price).control.focus();
    return ok;
  };
  const body = () => ({
    name: name.control.value, description: description.control.value, amount: price.control.value.trim(), mode: org.mode,
    active: open.checked, iconKey: icon.value,
  });
  return { fields: [name, description, price], extra: [icon.node, openWrapper], validate, body };
}

function benefitsSection(ctx, { items, theme }, money) {
  const { org } = ctx;
  const draft = benefitFields(org, theme);
  const error = formError();
  const add = button(t('benefits.add'), { kind: 'primary', type: 'submit' });
  const form = el('form', {
    attrs: { class: 'stack', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        for (const item of draft.fields) item.setError();
        if (!draft.validate()) return;
        const body = draft.body();
        // Same benefit, same key: adding it again after a lost answer does not create a second one.
        const action = `benefit:${JSON.stringify(body)}`;
        add.disabled = true;
        let reward;
        try {
          reward = await request('/api/admin/rewards', { method: 'POST', body, key: await keyFor(action) });
        } catch (failure) {
          if (wasRefused(failure)) await settleKey(action);
          add.disabled = false;
          ctx.fail(failure, error);
          return;
        }
        await settleKey(action);
        toast(t(reward.replayed ? 'benefits.alreadyAdded' : 'benefits.added', { name: reward.name }));
        ctx.render();
      },
    },
  }, [
    ...(unconfirmedSince('benefit').length ? [unconfirmedNotice('benefits.unconfirmed', unconfirmedSince('benefit'))] : []),
    ...draft.fields.map(item => item.wrapper), ...draft.extra, error.node, add,
  ]);
  const rows = items.map(reward => el('li', { attrs: { class: 'row' } }, [
    reward.iconKey ? el('span', { attrs: { class: 'row-icon' } }, [spriteCanvas(reward.iconKey, 3)]) : null,
    el('div', { attrs: { class: 'row-main' } }, [
      el('p', { text: reward.name, attrs: { class: 'row-title' } }),
      reward.description ? el('p', { text: reward.description, attrs: { class: 'muted small' } }) : null,
    ]),
    el('p', { text: money(reward.costUnits), attrs: { class: 'price' } }),
    badge(reward.active ? 'open' : 'closed'),
    el('div', { attrs: { class: 'row-actions' } }, [
      button(t('common.edit'), {
        attrs: { 'aria-label': t('benefits.editNamed', { name: reward.name }) },
        on: {
          click: () => {
            const edit = benefitFields(org, theme, reward);
            actionDialog(ctx, {
              title: t('benefits.editTitle', { name: reward.name }),
              intro: [t('benefits.snapshotNote')],
              fields: edit.fields, extra: edit.extra, submitLabel: t('common.save'), validate: edit.validate,
              // Saving the same values twice leaves the same benefit, so an edit needs no request key.
              action: () => `benefit-edit:${reward.id}`,
              send: () => request(`/api/admin/rewards/${reward.id}`, { method: 'PATCH', body: edit.body() }),
              done(saved) { toast(t('benefits.saved', { name: saved.name })); ctx.render(); },
            });
          },
        },
      }),
    ]),
  ]));
  return section(t('team.benefits'), [
    rows.length ? el('ul', { attrs: { class: 'rows' } }, rows) : el('p', { text: t('benefits.none'), attrs: { class: 'muted' } }),
    el('details', { attrs: { class: 'invite' } }, [el('summary', { text: t('benefits.addTitle'), attrs: { class: 'btn btn-secondary' } }), form]),
    el('p', { text: t('benefits.snapshotNote'), attrs: { class: 'muted small' } }),
  ], { className: 'wide' });
}

/* ---------------------------------------------------------------- the log */

function reasonDialog(ctx, { title, intro, submitLabel, action, path, done }) {
  const reason = field({ label: t('common.reason'), name: 'reason', multiline: true, attrs: { maxlength: 500 } });
  actionDialog(ctx, {
    title, intro, fields: [reason], submitLabel, danger: true,
    validate() {
      if (reason.control.value.trim()) return true;
      reason.setError(t('form.reasonRequired'));
      reason.control.focus();
      return false;
    },
    action: () => `${action}:${reason.control.value.trim()}`,
    send: key => request(path, { method: 'POST', key, body: { reason: reason.control.value } }),
    done,
  });
}

/* Taking back one treat, from its own line or from its person's row in an opened batch. */
function takeBackButton(ctx, item, money, titleId, then) {
  return button(t('revoke.open'), { kind: 'quiet', attrs: { 'aria-describedby': titleId }, on: { click: () => reasonDialog(ctx, {
    title: t('revoke.title'),
    intro: [t('revoke.what', { amount: money(item.deltaUnits), name: item.member.displayName, date: formatDate(item.createdAt) }), el('p', { text: themed('revoke.explain', ctx.org.theme), attrs: { class: 'muted small' } })],
    submitLabel: t('revoke.submit'), action: `revoke:${item.id}`, path: `/api/admin/grants/${item.id}/revoke`,
    done() { toast(t('revoke.done', { name: item.member.displayName })); then(); },
  }) } });
}

function logRow(ctx, item, money) {
  const titleId = uid('entry');
  const plus = item.deltaUnits > 0;
  let action = null;
  if (item.kind === 'grant' && !item.corrected) {
    action = takeBackButton(ctx, item, money, titleId, () => ctx.render());
  } else if (item.kind === 'spend' && !item.corrected) {
    action = button(t('void.open'), { kind: 'quiet', attrs: { 'aria-describedby': titleId }, on: { click: () => reasonDialog(ctx, {
      title: t('void.title'),
      intro: [t('void.what', { amount: money(-item.deltaUnits), name: item.member.displayName, date: formatDate(item.createdAt) }), el('p', { text: t('void.explain'), attrs: { class: 'muted small' } })],
      submitLabel: t('void.submit'), action: `void:${item.id}`, path: `/api/admin/spends/${item.id}/void`,
      done() { toast(t('void.done', { name: item.member.displayName })); ctx.render(); },
    }) } });
  } else if (item.kind === 'redeem' && item.sourceId && !item.refunded) {
    action = button(t('redemptions.refund'), { kind: 'quiet', attrs: { 'aria-describedby': titleId }, on: { click: () => reasonDialog(ctx, {
      title: t('redemptions.refundTitle', { reward: item.rewardName ?? '', name: item.member.displayName }),
      intro: [t('redemptions.refundExplain', { amount: money(-item.deltaUnits) })],
      submitLabel: t('redemptions.refundSubmit'), action: `refund:${item.sourceId}`, path: `/api/admin/redemptions/${item.sourceId}/refund`,
      done() { toast(t('redemptions.refunded', { reward: item.rewardName ?? '' })); ctx.render(); },
    }) } });
  }
  let mark = null;
  if (item.corrected) mark = badge(item.kind === 'grant' ? 'revoked' : 'voided');
  else if (item.refunded) mark = badge('refunded');
  return el('li', { attrs: { class: `rec log-${item.kind}` } }, [
    el('span', { attrs: { class: `rec-diamond ${plus ? 'plus' : 'minus'}`, 'aria-hidden': 'true' } }),
    el('span', { text: signedAmount(item.deltaUnits, money), attrs: { class: `rec-amt ${plus ? 'plus' : 'minus'}` } }),
    el('span', { text: `${item.member.displayName} · ${historyTitle(item, { own: false })}`, attrs: { class: 'rec-label', id: titleId } }),
    el('span', { text: formatDateTime(item.createdAt), attrs: { class: 'rec-time' } }),
    mark,
    item.reason ? el('p', { text: item.reason, attrs: { class: 'rec-note' } }) : null,
    action ? el('div', { attrs: { class: 'row-actions' } }, [action]) : null,
  ]);
}

/* Taking back one treat of a batch draws the page again; that draw opens the batch again, so
 * the badge shows where the change was made. Read, and cleared, as the page starts to draw. */
let reopenBatch = null;

/* A batch is one line: "3 people · +$20.00 each". Opening it lists each person with their
 * own amount and their own "Take back", loaded in full whatever page the line came from. */
function batchLine(ctx, item, money, open) {
  const titleId = uid('entry');
  const listId = uid('batch');
  const people = el('ul', { attrs: { class: 'rows batch-people', id: listId, hidden: true } });
  const toggle = button(t('me.seeAll'), { kind: 'quiet', attrs: { 'aria-expanded': 'false', 'aria-controls': listId, 'aria-describedby': titleId } });
  const personRow = entry => {
    const nameId = uid('entry');
    return el('li', { attrs: { class: 'row' } }, [
      el('p', { text: entry.member.displayName, attrs: { class: 'batch-name', id: nameId } }),
      el('span', { text: signedAmount(entry.deltaUnits, money), attrs: { class: 'amount plus' } }),
      entry.revoked
        ? badge('revoked')
        : el('div', { attrs: { class: 'row-actions' } }, [takeBackButton(ctx, entry, money, nameId, () => {
          reopenBatch = item.batchId;
          ctx.render();
        })]),
    ]);
  };
  let loaded = false;
  const show = async open => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = t(open ? 'me.collapse' : 'me.seeAll');
    people.hidden = !open;
    if (!open || loaded) return;
    loaded = true;
    people.replaceChildren(el('li', { attrs: { class: 'row' } }, [loading()]));
    let entries;
    try {
      entries = await requestAll(`/api/admin/ledger?batchId=${encodeURIComponent(item.batchId)}`);
    } catch (failure) {
      if (!ctx.isCurrent()) return;
      loaded = false;
      show(false);
      ctx.fail(failure);
      return;
    }
    if (!ctx.isCurrent()) return;
    entries.sort((a, b) => a.member.displayName.localeCompare(b.member.displayName, getLocale()));
    people.replaceChildren(...entries.map(personRow));
  };
  toggle.addEventListener('click', () => show(toggle.getAttribute('aria-expanded') !== 'true'));
  if (open) show(true);
  return el('li', { attrs: { class: 'rec log-grant log-batch' } }, [
    el('span', { attrs: { class: 'rec-diamond plus', 'aria-hidden': 'true' } }),
    el('span', { text: t('log.batchEach', { amount: signedAmount(item.deltaUnits, money) }), attrs: { class: 'rec-amt plus' } }),
    el('span', { text: `${t('log.batch', { count: item.batchSize })} · ${historyTitle(item, { own: false })}`, attrs: { class: 'rec-label', id: titleId } }),
    el('span', { text: formatDateTime(item.createdAt), attrs: { class: 'rec-time' } }),
    item.reason ? el('p', { text: item.reason, attrs: { class: 'rec-note' } }) : null,
    el('div', { attrs: { class: 'row-actions' } }, [toggle]),
    people,
  ]);
}

function logSection(ctx, page, money, reopen) {
  // A batch is one line where its first row turns up; its other rows, on this page or on one
  // that "Show more" adds, are skipped. A batch of one is just a treat.
  const shown = new Set();
  let opening = reopen;
  const toRow = item => {
    if (!item.batchId || item.batchSize < 2) return logRow(ctx, item, money);
    if (shown.has(item.batchId)) return null;
    shown.add(item.batchId);
    return batchLine(ctx, item, money, item.batchId === opening);
  };
  const list = el('ul', { attrs: { class: 'rows team-log' } }, page.items.map(toRow));
  // Only the first page reopens a batch; one further down stays folded until asked.
  opening = null;
  return section(t('team.log'), [
    el('div', { attrs: { class: 'row-actions' } }, [
      el('a', { text: t('history.download'), attrs: { href: '/api/admin/ledger.csv', download: 'crumb-ledger.csv', class: 'btn btn-secondary' } }),
    ]),
    el('p', { text: t('history.csvNote'), attrs: { class: 'muted small' } }),
    page.items.length ? list : el('p', { text: t('me.noHistory'), attrs: { class: 'muted' } }),
    pager(ctx, list, page, cursor => `/api/admin/ledger?limit=${LOG_PAGE}&cursor=${encodeURIComponent(cursor)}`, toRow),
  ], { className: 'wide' });
}

/* ---------------------------------------------------------------- the page */

export async function renderAdmin(main, ctx) {
  main.replaceChildren(loading());
  const reopen = reopenBatch;
  reopenBatch = null;
  const openPerson = reopenPerson;
  reopenPerson = null;
  const { org } = ctx;
  const money = moneyFor(org);
  let people;
  let pending;
  let rewards = { items: [] };
  let log;
  try {
    [people, pending, log] = await Promise.all([
      requestAll('/api/admin/members'),
      requestAll('/api/admin/redemptions?status=pending'),
      request(`/api/admin/ledger?limit=${LOG_PAGE}`),
    ]);
    if (org.spending === 'confirm') rewards = await request('/api/admin/rewards');
  } catch (failure) {
    if (ctx.isCurrent()) ctx.fail(failure);
    return;
  }
  if (!ctx.isCurrent()) return;
  const give = button(t('grant.open'), { kind: 'primary', attrs: { class: 'btn btn-primary act' }, on: { click: () => openGrant(ctx, () => ctx.render()) } });
  const grid = el('div', { attrs: { class: 'team-grid' } }, [
    el('div', { attrs: { class: 'wide' } }, [give]),
    // Requests still waiting after a switch to self-recorded spending are seen through here.
    org.spending === 'confirm' || pending.length ? waitingSection(ctx, pending, money) : null,
    peopleSection(ctx, people, money, openPerson),
    org.spending === 'confirm' ? benefitsSection(ctx, rewards, money) : null,
    logSection(ctx, log, money, reopen),
  ].filter(Boolean));
  main.replaceChildren(
    el('div', { attrs: { class: 'page-head' } }, [el('h1', { text: t('team.title'), attrs: { class: 'page-title' } })]),
    grid,
  );
  // Back on the person a change was made for, with their row open; or on the batch a treat was
  // taken back from, open again (a batch below the log's first page stays folded, see logSection).
  if (openPerson) main.querySelector('.person[aria-expanded="true"]')?.focus();
  else if (reopen) main.querySelector('.log-batch button[aria-expanded="true"]')?.focus();
  // Admins cannot open Settings, so they read the activity log here, below the Log; owners read
  // it in Settings and are not shown it twice. As there, the page is usable before it loads.
  if (ctx.user.role !== 'admin') return;
  try {
    const activity = await activitySection(ctx);
    if (ctx.isCurrent()) grid.append(activity);
  } catch (failure) {
    if (ctx.isCurrent()) ctx.fail(failure);
  }
}
