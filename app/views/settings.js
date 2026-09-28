/* Organization settings, for owners. Names, language and links can change at
 * any time; the reward rules lock once rewards are recorded (the server
 * enforces this — the disabled fields only explain it). */

import { request } from '../api.js';
import { button, el, field, formError, radios, toast } from '../dom.js';
import { LANGUAGES, t } from '../i18n.js';
import { amountToUnits, unitsToInput } from '../format.js';
import { card, loading } from './member.js';

const CURRENCIES = ['CAD', 'USD', 'CNY'];
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const OPERATIONS_GUIDE = 'https://github.com/bellaaaaxu/crumb/blob/main/docs/OPERATIONS.md';

const looksLikeContact = value => value === '' || /^https:\/\/\S+$/i.test(value) || /^mailto:[^\s@]+@[^\s@]+$/i.test(value);
const looksLikeHttps = value => value === '' || /^https:\/\/\S+$/i.test(value);

function settingsForm(ctx, org) {
  const name = field({ label: t('setup.orgName'), name: 'name', value: org.name, attrs: { maxlength: 80 } });
  const welcome = field({ label: t('settings.welcome'), name: 'welcome', value: org.welcome, multiline: true, hint: t('settings.welcomeHint'), attrs: { maxlength: 500 } });
  const locale = field({ label: t('settings.language'), name: 'locale', value: org.locale, options: LANGUAGES, hint: t('settings.languageHint') });
  const unitLabel = field({ label: t('setup.unitLabel'), name: 'unitLabel', value: org.unitLabel, hint: t('setup.unitLabelHint'), attrs: { maxlength: 24 } });
  const mode = radios({
    legend: t('setup.mode'), name: 'mode', value: org.mode,
    options: [
      { value: 'credit', label: t('mode.credit'), detail: t('mode.creditDetail') },
      { value: 'points', label: t('mode.points'), detail: t('mode.pointsDetail') },
    ],
  });
  const currency = field({
    label: t('setup.currency'), name: 'currency', value: org.currency ?? 'CAD',
    options: CURRENCIES.map(value => ({ value, label: t(`currency.${value}`) })),
  });
  const threshold = field({
    label: t('setup.threshold'), name: 'threshold', value: unitsToInput(org.thresholdUnits, org.mode),
    hint: t(org.mode === 'credit' ? 'setup.thresholdCredit' : 'setup.thresholdPoints'),
  });
  const adminContact = field({ label: t('settings.contact'), name: 'adminContact', value: org.adminContact, hint: t('settings.contactHint'), attrs: { maxlength: 300, inputmode: 'url' } });
  const feedbackUrl = field({ label: t('settings.feedback'), name: 'feedbackUrl', value: org.feedbackUrl, hint: t('settings.feedbackHint'), attrs: { maxlength: 300, inputmode: 'url' } });

  mode.disabled = org.locks.mode;
  currency.control.disabled = org.locks.mode;
  threshold.control.disabled = org.locks.threshold;
  const showCurrency = () => { currency.wrapper.hidden = mode.value !== 'credit'; };
  for (const input of mode.inputs) input.addEventListener('change', showCurrency);
  showCurrency();

  const error = formError();
  const save = button(t('settings.save'), { kind: 'primary', type: 'submit' });
  const checked = [name, unitLabel, threshold, adminContact, feedbackUrl];
  const form = el('form', {
    attrs: { class: 'stack', novalidate: true },
    on: {
      submit: async event => {
        event.preventDefault();
        error.clear();
        for (const item of checked) item.setError();
        const problems = [];
        const check = (ok, item, message) => { if (!ok) { item.setError(message); problems.push(item); } };
        const chosenMode = mode.value;
        check(name.control.value.trim() !== '', name, t('form.required'));
        check(unitLabel.control.value.trim() !== '', unitLabel, t('form.required'));
        if (!org.locks.threshold)
          check(amountToUnits(threshold.control.value.trim(), chosenMode) !== null, threshold,
            t(chosenMode === 'credit' ? 'amount.creditError' : 'amount.pointsError'));
        check(looksLikeContact(adminContact.control.value.trim()), adminContact, t('settings.contactHint'));
        check(looksLikeHttps(feedbackUrl.control.value.trim()), feedbackUrl, t('settings.feedbackHint'));
        if (problems.length) {
          problems[0].control.focus();
          return;
        }
        const body = {
          name: name.control.value, welcome: welcome.control.value, locale: locale.control.value, unitLabel: unitLabel.control.value,
          adminContact: adminContact.control.value.trim(), feedbackUrl: feedbackUrl.control.value.trim(),
        };
        if (!org.locks.mode) {
          body.mode = chosenMode;
          if (chosenMode === 'credit') body.currency = currency.control.value;
        }
        if (!org.locks.threshold) body.threshold = threshold.control.value.trim();
        save.disabled = true;
        try {
          await request('/api/org', { method: 'PATCH', body });
          toast(t('settings.saved'));
          await ctx.refresh();
        } catch (failure) {
          save.disabled = false;
          ctx.fail(failure, error);
        }
      },
    },
  }, [
    el('h2', { text: t('settings.orgTitle'), attrs: { class: 'card-title' } }),
    name.wrapper, welcome.wrapper, locale.wrapper,
    el('h2', { text: t('settings.rewardsTitle'), attrs: { class: 'card-title' } }),
    unitLabel.wrapper, mode.fieldset, currency.wrapper, threshold.wrapper,
    org.locks.mode || org.locks.threshold ? el('p', { text: t('settings.locked'), attrs: { class: 'notice' } }) : null,
    el('h2', { text: t('settings.linksTitle'), attrs: { class: 'card-title' } }),
    adminContact.wrapper, feedbackUrl.wrapper,
    error.node,
    save,
  ]);
  return el('section', { attrs: { class: 'card settings-card', 'aria-label': t('nav.settings') } }, [form]);
}

function logoCard(ctx, org) {
  const input = field({ label: t('settings.logoUpload'), name: 'logo', type: 'file', hint: t('settings.logoHint'), attrs: { accept: LOGO_TYPES.join(',') } });
  const error = formError();
  input.control.addEventListener('change', async () => {
    error.clear();
    const [file] = input.control.files;
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type) || file.size > 1024 * 1024) {
      input.setError(t('settings.logoHint'));
      return;
    }
    input.setError();
    try {
      await request('/api/org/logo', { method: 'PUT', body: file, contentType: file.type });
      toast(t('settings.logoSaved'));
      await ctx.refresh();
    } catch (failure) {
      ctx.fail(failure, error);
    }
  });
  const remove = org.hasLogo ? button(t('settings.logoRemove'), {
    kind: 'quiet',
    on: {
      click: async () => {
        try {
          await request('/api/org/logo', { method: 'DELETE' });
          toast(t('settings.logoRemoved'));
          await ctx.refresh();
        } catch (failure) {
          ctx.fail(failure, error);
        }
      },
    },
  }) : null;
  return card(t('settings.logoTitle'), [
    org.hasLogo
      ? el('img', { attrs: { src: `/api/org/logo?v=${Date.now()}`, alt: t('settings.logoCurrent'), class: 'logo-preview' } })
      : el('p', { text: t('settings.noLogo'), attrs: { class: 'muted' } }),
    input.wrapper,
    remove,
    error.node,
  ]);
}

function dataCard() {
  return card(t('settings.dataTitle'), [
    el('p', {}, [el('a', { text: t('history.download'), attrs: { href: '/api/admin/ledger.csv', download: 'crumb-ledger.csv', class: 'btn btn-secondary' } })]),
    el('p', { text: t('settings.backupNote'), attrs: { class: 'muted small' } }),
    el('p', {}, [el('a', { text: t('settings.backupGuide'), attrs: { href: OPERATIONS_GUIDE, target: '_blank', rel: 'noopener noreferrer' } })]),
  ]);
}

export async function renderSettings(main, ctx) {
  main.replaceChildren(loading());
  let session;
  try {
    session = await request('/api/session');
  } catch (failure) {
    if (ctx.isCurrent()) ctx.fail(failure);
    return;
  }
  if (!ctx.isCurrent()) return;
  const { org } = session;
  main.replaceChildren(
    el('h1', { text: t('nav.settings'), attrs: { class: 'page-title' } }),
    el('div', { attrs: { class: 'settings-grid' } }, [settingsForm(ctx, org), el('div', { attrs: { class: 'stack' } }, [logoCard(ctx, org), dataCard()])]),
  );
}
