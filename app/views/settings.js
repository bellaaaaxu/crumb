/* Organization settings, for owners. Names, language, links and how people spend can
 * change at any time; the reward rules and the collection theme lock once rewards are
 * recorded (the server enforces this — the disabled fields only explain it). The activity
 * log sits at the bottom. */

import { request } from '../api.js';
import { button, el, field, formError, radios, toast } from '../dom.js';
import { LANGUAGES, t, themed } from '../i18n.js';
import { amountToUnits, unitsToInput } from '../format.js';
import { loading, section, themeCards } from './shared.js';
import { activitySection } from './activity.js';

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
  // Fixed with the unlock step at the first treat. A chosen card takes effect on Save; until
  // then only the unlock-step hint follows it, and the header keeps the saved theme's mascot.
  const theme = themeCards(org.theme, { disabled: org.locks.theme });
  // Each key is themed()'s first argument: tests/i18n.test.mjs counts them there. Without the
  // pixel table there are no cards and no chosen one, and the hint follows the saved theme.
  const hintTheme = () => theme.value ?? org.theme;
  const thresholdHint = () => (mode.value === 'credit' ? themed('setup.thresholdCredit', hintTheme()) : themed('setup.thresholdPoints', hintTheme()));
  const threshold = field({
    label: t('setup.threshold'), name: 'threshold', value: unitsToInput(org.thresholdUnits, org.mode),
    hint: thresholdHint(),
  });
  // Not one of the locked reward rules: an owner can switch at any time, and requests still
  // waiting are finished either way.
  const spending = radios({
    legend: t('settings.spendingTitle'), name: 'spending', value: org.spending,
    options: [
      { value: 'self', label: t('spending.self'), detail: t('spending.selfDetail') },
      { value: 'confirm', label: t('spending.confirm'), detail: t('spending.confirmDetail') },
    ],
  });
  // The heading above the choice says the same words: the legend stays for screen readers only.
  spending.fieldset.querySelector('legend').classList.add('sr-only');
  const adminContact = field({ label: t('settings.contact'), name: 'adminContact', value: org.adminContact, hint: t('settings.contactHint'), attrs: { maxlength: 300, inputmode: 'url' } });
  const feedbackUrl = field({ label: t('settings.feedback'), name: 'feedbackUrl', value: org.feedbackUrl, hint: t('settings.feedbackHint'), attrs: { maxlength: 300, inputmode: 'url' } });

  mode.disabled = org.locks.mode;
  currency.control.disabled = org.locks.mode;
  threshold.control.disabled = org.locks.threshold;
  // Switching between credit and points changes what the threshold means, so it
  // follows the choice (a default for the other unit, the saved value when switching
  // back) until the owner types their own.
  let thresholdEdited = false;
  threshold.control.addEventListener('input', () => { thresholdEdited = true; });
  const showHint = () => { threshold.wrapper.querySelector('.field-hint').textContent = thresholdHint(); };
  const applyMode = () => {
    const credit = mode.value === 'credit';
    currency.wrapper.hidden = !credit;
    threshold.control.setAttribute('inputmode', credit ? 'decimal' : 'numeric');
    showHint();
    if (!thresholdEdited && !org.locks.threshold)
      threshold.control.value = mode.value === org.mode ? unitsToInput(org.thresholdUnits, org.mode) : (credit ? '50.00' : '100');
  };
  for (const input of mode.inputs) input.addEventListener('change', applyMode);
  for (const input of theme.inputs) input.addEventListener('change', showHint);
  applyMode();

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
          spending: spending.value,
        };
        if (!org.locks.mode) {
          body.mode = chosenMode;
          if (chosenMode === 'credit') body.currency = currency.control.value;
        }
        if (!org.locks.threshold) body.threshold = threshold.control.value.trim();
        if (!org.locks.theme && theme.value) body.theme = theme.value;
        save.disabled = true;
        try {
          const saved = await request('/api/org', { method: 'PATCH', body });
          // A theme change took out, in the same write, the benefit icons the new theme lacks.
          // Say how many instead of the usual words; read here, before the refresh redraws.
          toast(saved.iconsRemoved > 0 ? t('settings.themeChanged', { count: saved.iconsRemoved }) : t('settings.saved'));
          // The tab and home-screen icon links follow the saved theme without a reload, even if
          // the refresh below fails; the refresh then points them at the same files again.
          ctx.applyThemeIcons(saved.theme);
          await ctx.refresh();
        } catch (failure) {
          save.disabled = false;
          ctx.fail(failure, error);
        }
      },
    },
  }, [
    el('h2', { text: t('settings.orgTitle'), attrs: { class: 'tile-title' } }),
    name.wrapper, welcome.wrapper, locale.wrapper,
    el('h2', { text: t('settings.rewardsTitle'), attrs: { class: 'tile-title' } }),
    unitLabel.wrapper, mode.fieldset, currency.wrapper, threshold.wrapper, theme.fieldset,
    // Benefits alone fix the unit; a recorded reward also fixes the unlock step and the theme.
    org.locks.threshold || org.locks.theme || org.locks.mode
      ? el('p', { text: t(org.locks.threshold || org.locks.theme ? 'settings.locked' : 'settings.lockedByBenefits'), attrs: { class: 'notice' } })
      : null,
    el('h2', { text: t('settings.spendingTitle'), attrs: { class: 'tile-title' } }),
    spending.fieldset,
    el('p', { text: t('settings.spendingNote'), attrs: { class: 'muted small' } }),
    el('h2', { text: t('settings.linksTitle'), attrs: { class: 'tile-title' } }),
    adminContact.wrapper, feedbackUrl.wrapper,
    error.node,
    save,
  ]);
  return el('section', { attrs: { class: 'tile settings-card', 'aria-label': t('nav.settings') } }, [form]);
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
  return section(t('settings.logoTitle'), [
    org.hasLogo
      ? el('img', { attrs: { src: `/api/org/logo?v=${Date.now()}`, alt: t('settings.logoCurrent'), class: 'logo-preview' } })
      : el('p', { text: t('settings.noLogo'), attrs: { class: 'muted' } }),
    input.wrapper,
    remove,
    error.node,
  ]);
}

function dataCard() {
  return section(t('settings.dataTitle'), [
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
  const grid = el('div', { attrs: { class: 'team-grid' } }, [settingsForm(ctx, org), el('div', { attrs: { class: 'stack' } }, [logoCard(ctx, org), dataCard()])]);
  main.replaceChildren(el('h1', { text: t('nav.settings'), attrs: { class: 'page-title' } }), grid);
  // The settings are usable before the log has loaded; it joins the grid, across both columns.
  try {
    const activity = await activitySection(ctx);
    if (ctx.isCurrent()) grid.append(activity);
  } catch (failure) {
    if (ctx.isCurrent()) ctx.fail(failure);
  }
}
