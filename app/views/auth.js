/* Signed-out screens: first-time setup, sign-in, and the one-time links
 * (a team member's sign-in link; joining with an invitation or choosing a new
 * password, for owners and admins). */

import { request, setCsrf, wasRefused } from '../api.js';
import { button, el, field, formError, inWeChat, openedAsIPhoneHomeScreenApp, radios, toast, uid } from '../dom.js';
import { LANGUAGES, getLocale, t, themed } from '../i18n.js';
import { amountToUnits } from '../format.js';
import { mascotKey, pixelWord, spriteCanvas } from '../pixels.js';
import { loading, themeCards } from './shared.js';

const USERNAME = /^[a-z0-9._-]{3,64}$/;
const CURRENCIES = ['CAD', 'USD', 'CNY'];
const passwordLength = value => [...value].length;

/* A theme's mascot for the brand at the top of the card; Setup swaps it by its class. */
function brandMascot(themeId) {
  const node = spriteCanvas(mascotKey(themeId), 4);
  node.classList.add('auth-mascot');
  return node;
}

function frame(ctx, title, children) {
  const org = ctx.session.org;
  return el('main', { attrs: { id: 'main', class: 'auth', tabindex: '-1' } }, [
    el('div', { attrs: { class: 'auth-card' } }, [
      // The team's mascot. Before setup there is no team yet, and Pastry shop's is drawn.
      el('div', { attrs: { class: 'auth-brand' } }, [brandMascot(org?.theme), pixelWord('CRUMB', 5, '#4a2f1b')]),
      org?.hasLogo ? el('img', { attrs: { src: '/api/org/logo', alt: t('auth.logoAlt', { name: org.name }), class: 'auth-logo' } }) : null,
      el('h1', { text: title }),
      ...children,
      el('div', { attrs: { class: 'auth-foot' } }, [ctx.languagePicker()]),
    ]),
  ]);
}

function login(root, ctx) {
  const username = field({
    label: t('auth.username'), name: 'username', value: ctx.loginName,
    attrs: { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' },
  });
  const password = field({ label: t('auth.password'), name: 'password', type: 'password', attrs: { autocomplete: 'current-password' } });
  const error = formError();
  const submit = button(t('auth.signIn'), { kind: 'primary', type: 'submit' });
  const form = el('form', {
    attrs: { class: 'stack', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        if (!username.control.value.trim() || !password.control.value) {
          error.show(t('auth.missing'));
          return;
        }
        submit.disabled = true;
        try {
          const result = await request('/api/login', {
            method: 'POST', body: { username: username.control.value, password: password.control.value },
          });
          setCsrf(result.csrfToken);
          await ctx.onSignedIn();
        } catch (failure) {
          submit.disabled = false;
          password.control.value = '';
          if (failure.code === 'CSRF_FAILED') await ctx.renewSession().catch(() => {});
          error.show(ctx.errorText(failure));
          password.control.focus();
        }
      },
    },
  }, [username.wrapper, password.wrapper, error.node, submit]);
  const org = ctx.session.org;
  root.replaceChildren(frame(ctx, org ? t('auth.signInTo', { name: org.name }) : t('auth.signInTitle'), [
    ctx.notice ? el('p', { text: ctx.notice, attrs: { class: 'notice', role: 'status' } }) : null,
    el('p', { text: t('auth.memberHint'), attrs: { class: 'muted' } }),
    openedAsIPhoneHomeScreenApp() ? el('p', { text: t('auth.homeScreenApp'), attrs: { class: 'notice' } }) : null,
    form,
    el('p', { text: t('auth.forgot'), attrs: { class: 'muted small' } }),
  ]));
  document.title = `${t('title.login')} · Crumb`;
  (ctx.loginName ? password : username).control.focus();
}

/* Joining with an invitation, or choosing a new password from a reset link. */
function useLink(root, ctx, kind) {
  const password = field({
    label: t('auth.newPassword'), name: 'password', type: 'password', hint: t('auth.passwordHint'),
    attrs: { autocomplete: 'new-password' },
  });
  const confirm = field({ label: t('auth.confirmPassword'), name: 'confirm', type: 'password', attrs: { autocomplete: 'new-password' } });
  const error = formError();
  const submit = button(t(kind === 'invite' ? 'join.submit' : 'reset.submit'), { kind: 'primary', type: 'submit' });
  const leave = button(t('auth.toSignIn'), { kind: 'quiet', on: { click: () => ctx.finishLink() } });
  const form = el('form', {
    attrs: { class: 'stack', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        password.setError();
        confirm.setError();
        const value = password.control.value;
        if (passwordLength(value) < 12 || passwordLength(value) > 128) {
          password.setError(t('auth.passwordHint'));
          password.control.focus();
          return;
        }
        if (confirm.control.value !== value) {
          confirm.setError(t('auth.mismatch'));
          confirm.control.focus();
          return;
        }
        submit.disabled = true;
        try {
          const path = kind === 'invite' ? '/api/invitations/accept' : '/api/password/reset';
          const { username } = await request(path, { method: 'POST', body: { token: ctx.link.token, password: value } });
          ctx.finishLink({ username, notice: t(kind === 'invite' ? 'join.done' : 'reset.done', { username }) });
        } catch (failure) {
          submit.disabled = false;
          if (failure.code === 'CSRF_FAILED') await ctx.renewSession().catch(() => {});
          error.show(ctx.errorText(failure));
        }
      },
    },
  }, [password.wrapper, confirm.wrapper, error.node, submit]);
  const org = ctx.session.org;
  const title = kind === 'invite' ? t('join.title', { name: org?.name ?? 'Crumb' }) : t('reset.title');
  root.replaceChildren(frame(ctx, title, [
    el('p', { text: t(kind === 'invite' ? 'join.intro' : 'reset.intro'), attrs: { class: 'muted' } }),
    form,
    leave,
  ]));
  document.title = `${title} · Crumb`;
  password.control.focus();
}

/* A team member's personal link: it says whose it is, and one tap signs this
 * device in. No password: the link is the key, and it works once. So after
 * anything but a clear answer the page first asks the server who this browser
 * is now, instead of sending the member off to ask for a new link. */
async function signInWithLink(root, ctx) {
  const org = ctx.session.org;
  const title = org ? t('auth.signInTo', { name: org.name }) : t('auth.signInTitle');
  // Whoever was signed in on this browser when the link was opened (an admin trying it, say).
  const before = ctx.user;
  const paint = children => root.replaceChildren(frame(ctx, title, children));
  const leave = () => button(t('auth.toSignIn'), { kind: 'quiet', on: { click: () => ctx.finishLink() } });
  /* A clear no: say why and offer the way out, with the keyboard on it. */
  const refuse = (message, extra = []) => {
    const out = leave();
    paint([el('p', { text: message, attrs: { class: 'notice', role: 'alert' } }), ...extra, out]);
    (extra[0] ?? out).focus();
  };
  /* The tap may have signed this browser in even though its answer never arrived whole. */
  const signedInSince = async () => {
    const now = await ctx.renewSession().catch(() => null);
    return Boolean(now?.user && now.user.id !== before?.id);
  };

  document.title = `${title} · Crumb`;
  paint([loading()]);
  let person;
  try {
    person = await request('/api/signin/preview', { method: 'POST', body: { token: ctx.link.token } });
  } catch (failure) {
    if (!ctx.isCurrent()) return;
    // A used link opened again on a device that is still signed in (tapped in the chat once
    // more, say): just open Crumb.
    if (failure.code === 'INVALID_TOKEN' && before) {
      toast(t('signin.alreadyUsed', { name: before.displayName }));
      ctx.finishLink();
      return;
    }
    if (failure.code === 'CSRF_FAILED') await ctx.renewSession().catch(() => {});
    if (!ctx.isCurrent()) return;
    // Looking a link up uses nothing up, so anything but a clear no can simply be tried again.
    const definite = wasRefused(failure) && failure.code !== 'CSRF_FAILED';
    refuse(ctx.errorText(failure), definite ? [] : [button(t('common.tryAgain'), { kind: 'primary', on: { click: () => ctx.render() } })]);
    return;
  }
  if (!ctx.isCurrent()) return;
  const error = formError();
  const submit = button(t('signin.submit'), { kind: 'primary', type: 'submit' });
  const form = el('form', {
    attrs: { class: 'stack', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        submit.disabled = true;
        try {
          const result = await request('/api/signin/accept', { method: 'POST', body: { token: ctx.link.token } });
          setCsrf(result.csrfToken);
          await ctx.onSignedIn();
        } catch (failure) {
          if (!ctx.isCurrent()) return;
          if (await signedInSince()) {
            if (ctx.isCurrent()) await ctx.onSignedIn();
            return;
          }
          if (!ctx.isCurrent()) return;
          // The server said no (the link is used, expired or not for a team member): nothing left to tap.
          if (wasRefused(failure) && failure.code !== 'CSRF_FAILED') {
            refuse(ctx.errorText(failure));
            return;
          }
          // No clear answer: that tap may or may not have used the link.
          submit.disabled = false;
          error.show(failure.code === 'CSRF_FAILED' ? ctx.errorText(failure) : t('signin.noAnswer'));
          submit.focus();
        }
      },
    },
  }, [error.node, submit]);
  // Someone else signed in on this browser is signed out by the link; inside WeChat the sign-in
  // would stay in WeChat. Both are said before the tap, and read out with the button.
  const notes = [
    before ? t('signin.replaces', { name: before.displayName }) : null,
    inWeChat() ? t('signin.wechat') : null,
  ].filter(Boolean).map(text => el('p', { text, attrs: { class: 'notice', id: uid('signin-note') } }));
  if (notes.length) submit.setAttribute('aria-describedby', notes.map(note => note.id).join(' '));
  paint([
    el('p', { text: t('signin.who', { name: person.displayName }) }),
    el('p', { text: t('signin.note'), attrs: { class: 'muted' } }),
    ...notes,
    form,
    leave(),
  ]);
  submit.focus();
}

function setup(root, ctx) {
  const locale = getLocale();
  const code = field({ label: t('setup.code'), name: 'setupToken', hint: t('setup.codeHint'), attrs: { autocomplete: 'off', spellcheck: 'false' } });
  const orgName = field({ label: t('setup.orgName'), name: 'orgName', attrs: { autocomplete: 'organization', maxlength: 80 } });
  const language = field({ label: t('settings.language'), name: 'locale', options: LANGUAGES, value: locale });
  const mode = radios({
    legend: t('setup.mode'), name: 'mode', value: 'credit',
    options: [
      { value: 'credit', label: t('mode.credit'), detail: t('mode.creditDetail') },
      { value: 'points', label: t('mode.points'), detail: t('mode.pointsDetail') },
    ],
  });
  // Self-recorded by default: the owner can switch to confirmed requests in Settings at any time.
  const spending = radios({
    legend: t('setup.spending'), name: 'spending', value: 'self',
    options: [
      { value: 'self', label: t('spending.self'), detail: t('spending.selfDetail') },
      { value: 'confirm', label: t('spending.confirm'), detail: t('spending.confirmDetail') },
    ],
  });
  const currency = field({
    label: t('setup.currency'), name: 'currency', value: locale === 'zh-CN' ? 'CNY' : 'CAD',
    options: CURRENCIES.map(value => ({ value, label: t(`currency.${value}`) })),
  });
  const unitLabel = field({ label: t('setup.unitLabel'), name: 'unitLabel', hint: t('setup.unitLabelHint'), value: t('setup.creditLabel'), attrs: { maxlength: 24 } });
  // Pastry shop unless another card is chosen; Settings can change it until the first treat.
  // The unlock-step hint and the mascot at the top of the page follow the chosen card.
  const theme = themeCards('default');
  // Each key is themed()'s first argument: tests/i18n.test.mjs counts them there.
  const thresholdHint = () => (mode.value === 'credit' ? themed('setup.thresholdCredit', theme.value) : themed('setup.thresholdPoints', theme.value));
  const threshold = field({ label: t('setup.threshold'), name: 'threshold', hint: thresholdHint(), value: '50.00', attrs: { inputmode: 'decimal' } });
  const welcome = field({ label: t('settings.welcome'), name: 'welcome', multiline: true, hint: t('settings.welcomeHint'), attrs: { maxlength: 500 } });
  const displayName = field({ label: t('setup.yourName'), name: 'displayName', attrs: { autocomplete: 'name', maxlength: 80 } });
  const username = field({
    label: t('auth.username'), name: 'username', hint: t('setup.usernameHint'),
    attrs: { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' },
  });
  const password = field({ label: t('auth.password'), name: 'password', type: 'password', hint: t('auth.passwordHint'), attrs: { autocomplete: 'new-password' } });
  const confirm = field({ label: t('auth.confirmPassword'), name: 'confirm', type: 'password', attrs: { autocomplete: 'new-password' } });
  const error = formError();
  const submit = button(t('setup.submit'), { kind: 'primary', type: 'submit' });

  // Defaults follow the reward type until the person types their own.
  let labelEdited = false;
  let thresholdEdited = false;
  unitLabel.control.addEventListener('input', () => { labelEdited = true; });
  threshold.control.addEventListener('input', () => { thresholdEdited = true; });
  const showHint = () => { threshold.wrapper.querySelector('.field-hint').textContent = thresholdHint(); };
  const applyMode = () => {
    const credit = mode.value === 'credit';
    currency.wrapper.hidden = !credit;
    if (!labelEdited) unitLabel.control.value = t(credit ? 'setup.creditLabel' : 'setup.pointsLabel');
    if (!thresholdEdited) threshold.control.value = credit ? '50.00' : '100';
    threshold.control.setAttribute('inputmode', credit ? 'decimal' : 'numeric');
    showHint();
  };
  for (const input of mode.inputs) input.addEventListener('change', applyMode);
  const applyTheme = () => {
    showHint();
    root.querySelector('.auth-brand .auth-mascot')?.replaceWith(brandMascot(theme.value));
  };
  for (const input of theme.inputs) input.addEventListener('change', applyTheme);

  const fields = [code, orgName, unitLabel, threshold, displayName, username, password, confirm];
  const form = el('form', {
    attrs: { class: 'stack', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        for (const item of fields) item.setError();
        const problems = [];
        const check = (ok, item, message) => { if (!ok) { item.setError(message); problems.push(item); } };
        const chosenMode = mode.value;
        const name = username.control.value.trim().toLowerCase();
        check(code.control.value.trim() !== '', code, t('setup.codeMissing'));
        check(orgName.control.value.trim() !== '', orgName, t('form.required'));
        check(unitLabel.control.value.trim() !== '', unitLabel, t('form.required'));
        check(amountToUnits(threshold.control.value.trim(), chosenMode) !== null, threshold,
          t(chosenMode === 'credit' ? 'amount.creditError' : 'amount.pointsError'));
        check(displayName.control.value.trim() !== '', displayName, t('form.required'));
        check(USERNAME.test(name), username, t('setup.usernameHint'));
        const length = passwordLength(password.control.value);
        check(length >= 12 && length <= 128, password, t('auth.passwordHint'));
        check(confirm.control.value === password.control.value, confirm, t('auth.mismatch'));
        if (problems.length) {
          problems[0].control.focus();
          return;
        }
        submit.disabled = true;
        const org = {
          name: orgName.control.value, mode: chosenMode, unitLabel: unitLabel.control.value,
          threshold: threshold.control.value.trim(), locale: language.control.value, welcome: welcome.control.value,
          spending: spending.value,
        };
        if (chosenMode === 'credit') org.currency = currency.control.value;
        // No card to choose (the pixel table did not load): the server's default theme.
        if (theme.value) org.theme = theme.value;
        try {
          const result = await request('/api/setup', {
            method: 'POST',
            body: { setupToken: code.control.value.trim(), username: name, password: password.control.value, displayName: displayName.control.value, org },
          });
          setCsrf(result.csrfToken);
          await ctx.onSignedIn();
        } catch (failure) {
          submit.disabled = false;
          if (failure.code === 'INVALID_SETUP_TOKEN') {
            code.setError(ctx.errorText(failure));
            code.control.focus();
          } else {
            if (failure.code === 'CSRF_FAILED') await ctx.renewSession().catch(() => {});
            error.show(ctx.errorText(failure));
          }
        }
      },
    },
  }, [
    el('fieldset', { attrs: { class: 'group' } }, [el('legend', { text: t('setup.codeGroup') }), code.wrapper]),
    el('fieldset', { attrs: { class: 'group' } }, [
      el('legend', { text: t('setup.orgGroup') }),
      orgName.wrapper, language.wrapper, mode.fieldset, currency.wrapper, unitLabel.wrapper, threshold.wrapper, theme.fieldset,
      spending.fieldset, welcome.wrapper,
    ]),
    el('fieldset', { attrs: { class: 'group' } }, [
      el('legend', { text: t('setup.ownerGroup') }),
      displayName.wrapper, username.wrapper, password.wrapper, confirm.wrapper,
    ]),
    el('p', { text: t('setup.rulesNote'), attrs: { class: 'muted small' } }),
    error.node,
    submit,
  ]);
  root.replaceChildren(frame(ctx, t('setup.title'), [el('p', { text: t('setup.intro'), attrs: { class: 'muted' } }), form]));
  document.title = `${t('setup.title')} · Crumb`;
  code.control.focus();
}

export function renderAuth(root, ctx, mode) {
  if (mode === 'setup') setup(root, ctx);
  else if (mode === 'signin') signInWithLink(root, ctx);
  else if (mode === 'invite' || mode === 'reset') useLink(root, ctx, mode);
  else login(root, ctx);
}
