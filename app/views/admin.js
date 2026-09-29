/* Team management for owners and admins. The server re-checks every permission;
 * hiding a button here is a courtesy, not the control. */

import { keyFor, request, requestAll, settleKey, unconfirmedSince, wasRefused } from '../api.js';
import { button, copyText, el, field, formError, openDialog, radios, toast, uid } from '../dom.js';
import { formatDate, formatDateTime, getLocale, has, t } from '../i18n.js';
import { amountToUnits, formatUnits, unitsToInput } from '../format.js';
import { badge, card, historyTitle, loading, pager, signedAmount, unconfirmedNotice } from './member.js';

const moneyFor = org => units => formatUnits(units, org, getLocale());
const amountHint = org => t(org.mode === 'credit' ? 'amount.creditHint' : 'amount.pointsHint', { currency: org.currency, unit: org.unitLabel });
const amountError = org => t(org.mode === 'credit' ? 'amount.creditError' : 'amount.pointsError');

const SECTIONS = [
  ['', 'team.overview'], ['members', 'team.members'], ['benefits', 'team.benefits'],
  ['redemptions', 'team.redemptions'], ['history', 'team.history'], ['activity', 'team.activity'],
];

function subnav(current) {
  return el('nav', { attrs: { class: 'subnav', 'aria-label': t('team.navLabel') } },
    SECTIONS.map(([key, label]) => el('a', {
      text: t(label), attrs: { href: key ? `#/team/${key}` : '#/team', 'aria-current': key === current ? 'page' : false },
    })));
}

function pageHead(title, actions = []) {
  return el('div', { attrs: { class: 'page-head' } }, [el('h1', { text: title, attrs: { class: 'page-title' } }), ...actions]);
}

/**
 * A dialog for one change. Its idempotency key belongs to `action()` — what
 * is done, to what, with which values — and is kept until the server gives a
 * definite answer. So sending the same thing again after a dropped
 * connection repeats the same request, even after the dialog was closed and
 * opened again, and a request that did reach the server is never recorded
 * twice. Focus starts on the first field, or on Cancel when there is nothing
 * to fill in — never on a destructive button.
 */
function actionDialog(ctx, { title, intro = [], fields = [], extra = [], submitLabel, danger = false, validate, action, send, done }) {
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
  return opened.dialog;
}

/* One-tap row actions keep their idempotency key until the server gives a
 * definite answer, so tapping again after a dropped connection is a retry. */
async function oneTap(ctx, action, { method = 'POST', path, body }, onDone) {
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

/* ---------------------------------------------------------------- recognition */

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
  const member = field({
    label: t('grant.member'), name: 'userId',
    options: [{ value: '', label: t('grant.choose') }, ...members.map(person => ({
      value: person.id,
      label: person.id === ctx.user.id ? t('grant.you', { name: person.displayName }) : `${person.displayName} (@${person.username})`,
    }))],
  });
  const amount = field({ label: t('grant.amount'), name: 'amount', hint: amountHint(org), attrs: { inputmode: org.mode === 'credit' ? 'decimal' : 'numeric', autocomplete: 'off' } });
  const message = field({ label: t('grant.message'), name: 'reason', multiline: true, hint: t('grant.messageHint'), attrs: { maxlength: 500 } });
  const earlier = unconfirmedSince('grant');
  actionDialog(ctx, {
    title: t('grant.title'),
    intro: earlier.length ? [unconfirmedNotice('grant.unconfirmed', earlier)] : [],
    fields: [member, amount, message],
    submitLabel: t('grant.send'),
    validate() {
      if (!member.control.value) {
        member.setError(t('grant.chooseError'));
        member.control.focus();
        return false;
      }
      if (amountToUnits(amount.control.value.trim(), org.mode) === null) {
        amount.setError(amountError(org));
        amount.control.focus();
        return false;
      }
      return true;
    },
    action: () => `grant:${member.control.value}:${amountToUnits(amount.control.value.trim(), org.mode)}:${message.control.value.trim()}`,
    send: key => request('/api/admin/grants', {
      method: 'POST', key, body: { userId: member.control.value, amount: amount.control.value.trim(), mode: org.mode, reason: message.control.value },
    }),
    done(result) {
      const person = members.find(item => item.id === result.entry.userId);
      const params = { amount: money(result.entry.deltaUnits), name: person?.displayName ?? '' };
      if (result.replayed) {
        // The same reward sent again after a lost answer: say it was not added twice.
        toast(t('grant.alreadySent', params));
      } else {
        const sent = t('grant.sent', params);
        toast(result.unlocked.length ? `${sent} ${t('grant.unlocked', { count: result.unlocked.length })}` : sent);
      }
      done();
    },
  });
}

async function overview(container, ctx) {
  const [pending, recent] = await Promise.all([
    request('/api/admin/redemptions?status=pending&limit=100'),
    request('/api/admin/ledger?kind=grant&limit=6'),
  ]);
  if (!ctx.isCurrent()) return;
  const money = moneyFor(ctx.org);
  const give = button(t('grant.open'), { kind: 'primary', on: { click: () => openGrant(ctx, () => ctx.render()) } });
  container.replaceChildren(
    pageHead(t('team.title'), [give]),
    el('div', { attrs: { class: 'team-grid' } }, [
      card(t('team.waiting'), [pending.items.length
        ? el('p', {}, [el('a', { text: t('team.waitingCount', { count: pending.items.length }), attrs: { href: '#/team/redemptions' } })])
        : el('p', { text: t('team.nothingWaiting'), attrs: { class: 'muted' } })]),
      card(t('team.recent'), [recent.items.length
        ? el('ul', { attrs: { class: 'rows' } }, recent.items.map(item => el('li', { attrs: { class: 'row' } }, [
          el('p', { text: signedAmount(item.deltaUnits, money), attrs: { class: 'amount plus' } }),
          el('div', { attrs: { class: 'row-main' } }, [
            el('p', { text: t('team.recentLine', { name: item.member.displayName, by: item.actor.displayName }), attrs: { class: 'row-title' } }),
            item.reason ? el('p', { text: item.reason, attrs: { class: 'row-note' } }) : null,
            el('p', { text: formatDate(item.createdAt), attrs: { class: 'muted small' } }),
          ]),
          item.revoked ? badge('revoked') : null,
        ])))
        : el('p', { text: t('team.noRecent'), attrs: { class: 'muted' } })]),
    ]),
  );
}

/* ---------------------------------------------------------------- members */

/* One-time links are shown once, with a copy button, and can be dismissed. */
function linkPanel(label, url, note) {
  const link = field({ label, name: 'link', value: url, attrs: { readonly: true, class: 'link-input' } });
  const panel = el('div', { attrs: { class: 'link-panel' } }, [
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
      button(t('common.done'), { kind: 'quiet', on: { click: () => panel.remove() } }),
    ]),
  ]);
  return panel;
}

function changeRole(ctx, person, refresh) {
  const choice = radios({
    legend: t('members.role'), name: 'role', value: person.role,
    options: ['member', 'admin', 'owner'].map(value => ({ value, label: t(`role.${value}`), detail: t(`members.roleDetail.${value}`) })),
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
      let next = null;
      if (updated.status === 'invited') next = t('members.roleNewLink');
      else if (updated.role === 'member') next = t('members.roleNowLink', { name: person.displayName });
      else if (person.role === 'member') next = t('members.roleNowPassword', { name: person.displayName });
      toast(next ? `${changed} ${next}` : changed);
      refresh();
    },
  });
}

function memberRow(ctx, person, money, refresh, showLink) {
  const self = person.id === ctx.user.id;
  const manageable = !self && (ctx.user.role === 'owner' || person.role === 'member');
  const actions = [];
  const memberPath = `/api/admin/members/${person.id}`;
  const teamMember = person.role === 'member';
  // A team member's only way in is their personal link: a new one also signs a lost phone out.
  if (manageable && teamMember && person.status !== 'deactivated') {
    actions.push(button(t('members.newSigninLink'), {
      attrs: { 'aria-label': t('members.newSigninLinkNamed', { name: person.displayName }) },
      on: {
        click: () => oneTap(ctx, `signin:${person.id}`, { path: `${memberPath}/signin-link` },
          result => showLink(linkPanel(t('members.signinLink'), result.signinUrl, t('members.signinRenewNote', { name: person.displayName })))),
      },
    }));
  }
  if (manageable && !teamMember && person.status === 'invited') {
    actions.push(button(t('members.newInvite'), {
      attrs: { 'aria-label': t('members.newInviteNamed', { name: person.displayName }) },
      on: {
        click: () => oneTap(ctx, `invite:${person.id}`, { path: `${memberPath}/invitation` },
          result => showLink(linkPanel(t('members.inviteLink'), result.invitationUrl, t('members.inviteNote', { name: person.displayName })))),
      },
    }));
  }
  if (manageable && !teamMember && person.status === 'active') {
    actions.push(button(t('members.resetLink'), {
      attrs: { 'aria-label': t('members.resetLinkNamed', { name: person.displayName }) },
      on: {
        click: () => oneTap(ctx, `reset:${person.id}`, { path: `${memberPath}/reset` },
          result => showLink(linkPanel(t('members.resetLinkLabel'), result.resetUrl, t('members.resetNote', { name: person.displayName })))),
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
            refresh();
          },
        }),
      },
    }));
  }
  if (manageable && person.status === 'deactivated') {
    actions.push(button(t('members.reactivate'), {
      attrs: { 'aria-label': t('members.reactivateNamed', { name: person.displayName }) },
      on: {
        click: () => oneTap(ctx, `reactivate:${person.id}`, { method: 'PATCH', path: memberPath, body: { active: true } }, () => {
          toast(t('members.reactivated', { name: person.displayName }));
          refresh();
        }),
      },
    }));
  }
  // A role changes only through a dialog with a clear confirm: a picker that saved on every
  // arrow key could turn a member into an owner by accident.
  if (ctx.user.role === 'owner' && !self) {
    actions.unshift(button(t('members.changeRole'), {
      attrs: { 'aria-label': t('members.changeRoleNamed', { name: person.displayName }) },
      on: { click: () => changeRole(ctx, person, refresh) },
    }));
  }
  const roleControl = el('p', { text: t(`role.${person.role}`), attrs: { class: 'role' } });
  return el('li', { attrs: { class: 'row member-row' } }, [
    el('div', { attrs: { class: 'row-main' } }, [
      el('p', { text: self ? t('members.youLabel', { name: person.displayName }) : person.displayName, attrs: { class: 'row-title' } }),
      el('p', { text: `@${person.username} · ${t('members.available', { amount: money(person.balance.availableUnits) })}`, attrs: { class: 'muted small' } }),
    ]),
    roleControl,
    badge(`member-${person.status}`),
    actions.length ? el('div', { attrs: { class: 'row-actions' } }, actions) : null,
  ]);
}

async function members(container, ctx) {
  const money = moneyFor(ctx.org);
  const listArea = el('div', { attrs: { class: 'list-area' } }, [loading()]);
  const linkArea = el('div', { attrs: { class: 'link-area', 'aria-live': 'polite' } });
  const showLink = panel => linkArea.replaceChildren(panel);

  async function refresh() {
    let people;
    try {
      people = await requestAll('/api/admin/members');
    } catch (failure) {
      ctx.fail(failure);
      return;
    }
    if (!ctx.isCurrent()) return;
    people.sort((a, b) => a.displayName.localeCompare(b.displayName, getLocale()));
    listArea.replaceChildren(el('ul', { attrs: { class: 'rows' } }, people.map(person => memberRow(ctx, person, money, refresh, showLink))));
  }

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
        if (!name.control.value.trim()) {
          name.setError(t('form.required'));
          name.control.focus();
          return;
        }
        if (!/^[a-z0-9._-]{3,64}$/.test(handle)) {
          username.setError(t('setup.usernameHint'));
          username.control.focus();
          return;
        }
        create.disabled = true;
        try {
          const result = await request('/api/admin/invitations', {
            method: 'POST', body: { displayName: name.control.value, username: handle, role: role.control.value },
          });
          showLink(result.signinUrl
            ? linkPanel(t('members.signinLink'), result.signinUrl, t('members.signinNote', { name: result.user.displayName }))
            : linkPanel(t('members.inviteLink'), result.invitationUrl, t('members.inviteNote', { name: result.user.displayName })));
          form.reset();
          await refresh();
        } catch (failure) {
          if (failure.code === 'USERNAME_TAKEN') username.setError(ctx.errorText(failure));
          else ctx.fail(failure, error);
        } finally {
          create.disabled = false;
        }
      },
    },
  }, [name.wrapper, username.wrapper, role.wrapper, error.node, create]);

  container.replaceChildren(
    pageHead(t('team.members')),
    el('div', { attrs: { class: 'team-grid' } }, [
      card(t('members.invite'), [el('p', { text: t('members.inviteIntro'), attrs: { class: 'muted small' } }), form, linkArea], { className: 'invite-card' }),
      card(t('members.team'), [listArea], { className: 'team-card' }),
    ]),
  );
  await refresh();
}

/* ---------------------------------------------------------------- benefits */

function benefitFields(org, reward = {}) {
  const name = field({ label: t('benefits.name'), name: 'name', value: reward.name ?? '', attrs: { maxlength: 80 } });
  const description = field({ label: t('benefits.description'), name: 'description', multiline: true, value: reward.description ?? '', attrs: { maxlength: 500 } });
  const price = field({
    label: t('benefits.price'), name: 'amount', hint: amountHint(org),
    value: reward.costUnits ? unitsToInput(reward.costUnits, org.mode) : '',
    attrs: { inputmode: org.mode === 'credit' ? 'decimal' : 'numeric', autocomplete: 'off' },
  });
  const openId = `open-${Math.random().toString(36).slice(2)}`;
  const open = el('input', { attrs: { type: 'checkbox', id: openId, checked: reward.active ?? true } });
  const openWrapper = el('div', { attrs: { class: 'checkbox' } }, [open, el('label', { text: t('benefits.open'), attrs: { for: openId } })]);
  const validate = () => {
    let ok = true;
    if (!name.control.value.trim()) {
      name.setError(t('form.required'));
      ok = false;
    }
    if (amountToUnits(price.control.value.trim(), org.mode) === null) {
      price.setError(amountError(org));
      ok = false;
    }
    if (!ok) (name.control.getAttribute('aria-invalid') ? name : price).control.focus();
    return ok;
  };
  const body = () => ({
    name: name.control.value, description: description.control.value, amount: price.control.value.trim(), mode: org.mode, active: open.checked,
  });
  return { fields: [name, description, price], openWrapper, validate, body };
}

async function benefits(container, ctx) {
  const { org } = ctx;
  const money = moneyFor(org);
  const { items } = await request('/api/admin/rewards');
  if (!ctx.isCurrent()) return;
  const draft = benefitFields(org);
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
    ...draft.fields.map(item => item.wrapper), draft.openWrapper, error.node, add,
  ]);

  const rows = items.map(reward => el('li', { attrs: { class: 'row' } }, [
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
            const edit = benefitFields(org, reward);
            actionDialog(ctx, {
              title: t('benefits.editTitle', { name: reward.name }),
              intro: [t('benefits.snapshotNote')],
              fields: edit.fields,
              extra: [edit.openWrapper],
              submitLabel: t('common.save'),
              validate: edit.validate,
              // Saving the same values twice leaves the same benefit, so an edit needs no request key.
              action: () => `benefit-edit:${reward.id}`,
              send: () => request(`/api/admin/rewards/${reward.id}`, { method: 'PATCH', body: edit.body() }),
              done(saved) {
                toast(t('benefits.saved', { name: saved.name }));
                ctx.render();
              },
            });
          },
        },
      }),
    ]),
  ]));

  container.replaceChildren(
    pageHead(t('team.benefits')),
    el('div', { attrs: { class: 'team-grid' } }, [
      card(t('benefits.addTitle'), [form]),
      card(t('benefits.catalog'), [
        rows.length ? el('ul', { attrs: { class: 'rows' } }, rows) : el('p', { text: t('benefits.none'), attrs: { class: 'muted' } }),
        el('p', { text: t('benefits.snapshotNote'), attrs: { class: 'muted small' } }),
      ]),
    ]),
  );
}

/* ---------------------------------------------------------------- redemptions */

async function redemptions(container, ctx) {
  const money = moneyFor(ctx.org);
  const [pending, recent] = await Promise.all([
    requestAll('/api/admin/redemptions?status=pending'),
    request('/api/admin/redemptions?limit=25'),
  ]);
  if (!ctx.isCurrent()) return;

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
      fields: [reason],
      submitLabel: t('redemptions.declineSubmit'),
      danger: true,
      action: () => `reject:${item.id}:${reason.control.value.trim()}`,
      send: key => request(`/api/admin/redemptions/${item.id}/reject`, { method: 'POST', key, body: { reason: reason.control.value } }),
      done() {
        toast(t('redemptions.declined', { reward: item.rewardName }));
        ctx.render();
      },
    });
  };
  // For a request the member withdrew in person: it ends as "cancelled", not "declined".
  const cancel = item => actionDialog(ctx, {
    title: t('redemptions.cancelTitle', { reward: item.rewardName, name: item.member.displayName }),
    intro: [t('redemptions.cancelExplain', { name: item.member.displayName, amount: money(item.costUnits) })],
    submitLabel: t('redemptions.cancelSubmit'),
    action: () => `cancel:${item.id}`,
    send: key => request(`/api/redemptions/${item.id}/cancel`, { method: 'POST', key }),
    done() {
      toast(t('redemptions.cancelled', { reward: item.rewardName }));
      ctx.render();
    },
  });
  const refund = item => {
    const reason = field({ label: t('common.reason'), name: 'reason', multiline: true, attrs: { maxlength: 500 } });
    actionDialog(ctx, {
      title: t('redemptions.refundTitle', { reward: item.rewardName, name: item.member.displayName }),
      intro: [t('redemptions.refundExplain', { amount: money(item.costUnits) })],
      fields: [reason],
      submitLabel: t('redemptions.refundSubmit'),
      validate() {
        if (reason.control.value.trim()) return true;
        reason.setError(t('form.reasonRequired'));
        reason.control.focus();
        return false;
      },
      action: () => `refund:${item.id}:${reason.control.value.trim()}`,
      send: key => request(`/api/admin/redemptions/${item.id}/refund`, { method: 'POST', key, body: { reason: reason.control.value } }),
      done() {
        toast(t('redemptions.refunded', { reward: item.rewardName }));
        ctx.render();
      },
    });
  };

  // Each row's buttons are described by its title, so "Confirm delivery" says which request.
  const line = (item, actions) => {
    const titleId = uid('request');
    const described = actions(titleId);
    return el('li', { attrs: { class: 'row' } }, [
      el('div', { attrs: { class: 'row-main' } }, [
        el('p', { text: t('redemptions.line', { reward: item.rewardName, name: item.member.displayName }), attrs: { class: 'row-title', id: titleId } }),
        el('p', { text: `${money(item.costUnits)} · ${formatDateTime(item.createdAt)}`, attrs: { class: 'muted small' } }),
        item.reason ? el('p', { text: item.reason, attrs: { class: 'row-note' } }) : null,
      ]),
      ...described,
    ]);
  };
  const about = titleId => ({ 'aria-describedby': titleId });
  const pendingRows = pending.map(item => line(item, titleId => [el('div', { attrs: { class: 'row-actions' } }, [
    button(t('redemptions.confirm'), { kind: 'primary', attrs: about(titleId), on: { click: () => complete(item) } }),
    button(t('redemptions.decline'), { attrs: about(titleId), on: { click: () => decline(item) } }),
    button(t('redemptions.cancelRequest'), { kind: 'quiet', attrs: about(titleId), on: { click: () => cancel(item) } }),
  ])]));
  const finishedRow = item => line(item, titleId => [
    badge(item.refunded ? 'refunded' : item.status),
    item.status === 'completed' && !item.refunded
      ? el('div', { attrs: { class: 'row-actions' } }, [button(t('redemptions.refund'), { attrs: about(titleId), on: { click: () => refund(item) } })])
      : null,
  ]);
  const finished = recent.items.filter(item => item.status !== 'pending');
  // Always on the page, even while empty: "Show more" adds the next page's finished requests to it.
  const finishedList = el('ul', { attrs: { class: 'rows' } }, finished.map(finishedRow));

  container.replaceChildren(
    pageHead(t('team.redemptions')),
    card(t('redemptions.waiting'), [
      el('p', { text: t('redemptions.confirmHint'), attrs: { class: 'muted small' } }),
      pendingRows.length ? el('ul', { attrs: { class: 'rows' } }, pendingRows) : el('p', { text: t('team.nothingWaiting'), attrs: { class: 'muted' } }),
    ]),
    card(t('redemptions.recent'), [
      finishedList,
      finished.length || recent.nextCursor ? null : el('p', { text: t('redemptions.noneRecent'), attrs: { class: 'muted' } }),
      pager(ctx, finishedList, recent, cursor => `/api/admin/redemptions?limit=25&cursor=${encodeURIComponent(cursor)}`,
        item => (item.status === 'pending' ? null : finishedRow(item))),
    ]),
  );
}

/* ---------------------------------------------------------------- history */

async function history(container, ctx) {
  const money = moneyFor(ctx.org);
  const page = await request('/api/admin/ledger?limit=25');
  if (!ctx.isCurrent()) return;
  const revoke = item => {
    const reason = field({ label: t('common.reason'), name: 'reason', multiline: true, attrs: { maxlength: 500 } });
    actionDialog(ctx, {
      title: t('revoke.title'),
      intro: [
        t('revoke.what', { amount: money(item.deltaUnits), name: item.member.displayName, date: formatDate(item.createdAt) }),
        el('p', { text: t('revoke.explain'), attrs: { class: 'muted small' } }),
      ],
      fields: [reason],
      submitLabel: t('revoke.submit'),
      danger: true,
      validate() {
        if (reason.control.value.trim()) return true;
        reason.setError(t('form.reasonRequired'));
        reason.control.focus();
        return false;
      },
      action: () => `revoke:${item.id}:${reason.control.value.trim()}`,
      send: key => request(`/api/admin/grants/${item.id}/revoke`, { method: 'POST', key, body: { reason: reason.control.value } }),
      done() {
        toast(t('revoke.done', { name: item.member.displayName }));
        ctx.render();
      },
    });
  };
  const toRow = item => {
    const titleId = uid('entry');
    return el('li', { attrs: { class: `row history-${item.kind}` } }, [
      el('p', { text: signedAmount(item.deltaUnits, money), attrs: { class: `amount ${item.deltaUnits > 0 ? 'plus' : 'minus'}` } }),
      el('div', { attrs: { class: 'row-main' } }, [
        el('p', { text: `${item.member.displayName} · ${historyTitle(item)}`, attrs: { class: 'row-title', id: titleId } }),
        item.reason ? el('p', { text: item.reason, attrs: { class: 'row-note' } }) : null,
        el('p', { text: t('history.by', { name: item.actor.displayName, date: formatDateTime(item.createdAt) }), attrs: { class: 'muted small' } }),
      ]),
      item.revoked ? badge('revoked') : null,
      item.kind === 'grant' && !item.revoked
        ? el('div', { attrs: { class: 'row-actions' } }, [
          button(t('revoke.open'), { kind: 'quiet', attrs: { 'aria-describedby': titleId }, on: { click: () => revoke(item) } }),
        ])
        : null,
    ]);
  };
  const list = el('ul', { attrs: { class: 'rows' } }, page.items.map(toRow));
  container.replaceChildren(
    pageHead(t('team.history'), [
      el('a', { text: t('history.download'), attrs: { href: '/api/admin/ledger.csv', download: 'crumb-ledger.csv', class: 'btn btn-secondary' } }),
    ]),
    el('p', { text: t('history.csvNote'), attrs: { class: 'muted small' } }),
    card(t('history.ledger'), [
      page.items.length ? list : el('p', { text: t('me.noHistory'), attrs: { class: 'muted' } }),
      pager(ctx, list, page, cursor => `/api/admin/ledger?limit=25&cursor=${encodeURIComponent(cursor)}`, toRow),
    ]),
  );
}

/* ---------------------------------------------------------------- activity */

/* Audit rows hold ids; names are looked up so the log reads as sentences. */
function describe(item, money, names) {
  const key = `audit.${item.action}`;
  const detail = item.detail ?? {};
  const units = detail.units ?? detail.costUnits;
  const params = {
    name: names.get(detail.userId ?? item.targetId) ?? t('audit.someone'),
    units: units !== undefined ? money(units) : '',
    role: detail.to ? t(`role.${detail.to}`) : '',
  };
  return has(key) ? t(key, params) : item.action;
}

async function activity(container, ctx) {
  const money = moneyFor(ctx.org);
  const [page, people] = await Promise.all([request('/api/admin/audit?limit=25'), requestAll('/api/admin/members')]);
  if (!ctx.isCurrent()) return;
  const names = new Map(people.map(person => [person.id, person.displayName]));
  const toRow = item => el('li', { attrs: { class: 'row' } }, [
    el('div', { attrs: { class: 'row-main' } }, [
      el('p', { text: describe(item, money, names), attrs: { class: 'row-title' } }),
      el('p', { text: `${item.actor ? item.actor.displayName : t('audit.system')} · ${formatDateTime(item.createdAt)}`, attrs: { class: 'muted small' } }),
    ]),
  ]);
  const list = el('ul', { attrs: { class: 'rows' } }, page.items.map(toRow));
  container.replaceChildren(
    pageHead(t('team.activity')),
    el('p', { text: t('audit.intro'), attrs: { class: 'muted small' } }),
    card(t('audit.title'), [list, pager(ctx, list, page, cursor => `/api/admin/audit?limit=25&cursor=${encodeURIComponent(cursor)}`, toRow)]),
  );
}

const PAGES = { '': overview, members, benefits, redemptions, history, activity };

export async function renderAdmin(main, ctx, sub) {
  const page = Object.hasOwn(PAGES, sub) ? sub : '';
  const container = el('div', { attrs: { class: 'team-page' } }, [loading()]);
  main.replaceChildren(subnav(page), container);
  try {
    await PAGES[page](container, ctx);
  } catch (failure) {
    if (ctx.isCurrent()) ctx.fail(failure);
  }
}
