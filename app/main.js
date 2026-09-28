/* Crumb — the self-hosted app. Boots from GET /api/session: the server, not
 * the page, says who is signed in and what their role is. */

import { ApiError, request, setCsrf } from './api.js';
import { button, closeAllDialogs, el, safeUrl, toast, uid } from './dom.js';
import { LANGUAGES, getLocale, has, preferredLocale, rememberLocale, setLocale, t } from './i18n.js';
import { spriteCanvas } from './pixels.js';
import { renderAuth } from './views/auth.js';
import { renderMember } from './views/member.js';
import { renderAdmin } from './views/admin.js';
import { renderSettings } from './views/settings.js';

/* Feedback about Crumb itself goes to the project, unless the organization set its own form. */
const PROJECT_FEEDBACK = 'https://github.com/bellaaaaxu/crumb/issues/new/choose';

const root = document.getElementById('app');
const state = { session: null, link: null, notice: null, loginName: '', generation: 0 };

/* Invitation and reset links carry their token in the fragment (#invite=…).
 * Take it once and wipe it from the address bar and the history entry. */
function takeLinkFromFragment() {
  const match = /^#(invite|reset)=([A-Za-z0-9_-]{43})$/.exec(window.location.hash);
  if (!match) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { kind: match[1], token: match[2] };
}

async function loadSession() {
  const session = await request('/api/session');
  setCsrf(session.csrfToken);
  state.session = session;
  return session;
}

const isManager = user => user?.role === 'owner' || user?.role === 'admin';

function currentRoute() {
  const [section = '', sub = ''] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { section, sub };
}

function errorText(error) {
  if (error instanceof ApiError && has(`error.${error.code}`)) return t(`error.${error.code}`);
  return t('error.generic');
}

/* Signed out, expired or deactivated: back to sign-in with a note, whatever the view was doing. */
async function recoverFromSessionLoss(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 401 && error.code !== 'CSRF_FAILED' && error.code !== 'ACCOUNT_INACTIVE') return false;
  const wasSignedIn = Boolean(state.session?.user);
  try {
    await loadSession();
  } catch {
    // keep the old state; the next action will try again
  }
  if (wasSignedIn && !state.session.user) {
    state.notice = t('notice.signedOut');
    render();
    return true;
  }
  return false;
}

function changeLanguage(code) {
  rememberLocale(code);
  setLocale(code);
  render();
  // The page was rebuilt in the new language; keep the keyboard where it was.
  document.querySelector('.language select')?.focus();
}

function languagePicker() {
  const id = uid('language');
  return el('div', { attrs: { class: 'language' } }, [
    el('label', { text: t('nav.language'), attrs: { for: id } }),
    el('select', { attrs: { id, class: 'language-select' }, on: { change: event => changeLanguage(event.target.value) } },
      LANGUAGES.map(language => el('option', {
        text: language.label, attrs: { value: language.value, selected: language.value === getLocale() },
      }))),
  ]);
}

async function signOut() {
  try {
    await request('/api/logout', { method: 'POST' });
  } catch {
    // the session is dropped locally either way
  }
  state.notice = null;
  window.history.replaceState(null, '', window.location.pathname);
  await loadSession();
  render();
}

function context(generation) {
  return {
    session: state.session,
    user: state.session.user,
    org: state.session.org,
    notice: state.notice,
    loginName: state.loginName,
    link: state.link,
    /* A view that finished loading after the person moved on must not paint. */
    isCurrent: () => generation === state.generation,
    render,
    errorText,
    languagePicker,
    async refresh() {
      await loadSession();
      render();
    },
    async renewSession() {
      await loadSession();
    },
    /* Shows the error in the given form area (or as a toast) unless the session is gone. */
    async fail(error, area) {
      if (await recoverFromSessionLoss(error)) return;
      const message = errorText(error);
      if (area) area.show(message);
      else toast(message, { tone: 'error' });
    },
    async onSignedIn() {
      state.notice = null;
      state.loginName = '';
      await loadSession();
      render();
    },
    finishLink({ username = '', notice = null } = {}) {
      state.link = null;
      state.notice = notice;
      state.loginName = username;
      render();
    },
  };
}

function skipLink() {
  return el('a', {
    text: t('nav.skip'),
    attrs: { href: '#main', class: 'skip-link' },
    on: {
      click: event => {
        event.preventDefault();
        document.getElementById('main')?.focus();
      },
    },
  });
}

function header(section) {
  const { user, org } = state.session;
  const links = [['me', t('nav.me')]];
  if (isManager(user)) links.push(['team', t('nav.team')]);
  if (user.role === 'owner') links.push(['settings', t('nav.settings')]);
  return el('header', { attrs: { class: 'topbar' } }, [
    el('div', { attrs: { class: 'brand' } }, [
      org.hasLogo
        ? el('img', { attrs: { src: '/api/org/logo', alt: '', class: 'brand-logo', width: 36, height: 36 } })
        : el('span', { attrs: { class: 'brand-mark' } }, [spriteCanvas('laopo', 3)]),
      el('span', { text: org.name, attrs: { class: 'brand-name' } }),
    ]),
    el('nav', { attrs: { class: 'main-nav', 'aria-label': t('nav.label') } },
      links.map(([key, label]) => el('a', {
        text: label, attrs: { href: `#/${key}`, 'aria-current': key === section ? 'page' : false },
      }))),
    el('div', { attrs: { class: 'account' } }, [
      languagePicker(),
      el('span', { text: user.displayName, attrs: { class: 'who' } }),
      button(t('nav.signOut'), { kind: 'quiet', on: { click: signOut } }),
    ]),
  ]);
}

/* "Contact your admin" is this organization; "Feedback on Crumb" is the project.
 * They are labelled differently and never stand in for each other. */
function footer() {
  const { org } = state.session;
  const contact = safeUrl(org.adminContact);
  const feedback = safeUrl(org.feedbackUrl) ?? PROJECT_FEEDBACK;
  const external = href => (href.startsWith('mailto:') ? {} : { target: '_blank', rel: 'noopener noreferrer' });
  return el('footer', { attrs: { class: 'app-foot' } }, [
    contact
      ? el('a', { text: t('foot.contact'), attrs: { href: contact, ...external(contact) } })
      : el('span', { text: t('foot.noContact') }),
    el('a', { text: t('foot.feedback'), attrs: { href: feedback, ...external(feedback) } }),
    el('span', { text: t('foot.about', { version: state.session.version ?? '' }), attrs: { class: 'muted' } }),
  ]);
}

/* Changes are accepted only from the address Crumb was set up with (PUBLIC_ORIGIN). Opened
 * anywhere else — 127.0.0.1 instead of localhost, say — every change would fail, so say where to go. */
function wrongAddress() {
  const { origin } = state.session;
  if (!origin || origin === window.location.origin) return null;
  // The address comes from the server's own configuration; only a plain web origin becomes a link.
  let target = null;
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' || url.protocol === 'http:') target = url.origin;
  } catch {
    target = null;
  }
  return el('main', { attrs: { id: 'main', class: 'auth', tabindex: '-1' } }, [
    el('div', { attrs: { class: 'auth-card' } }, [
      el('h1', { text: t('origin.title'), attrs: { class: 'page-title' } }),
      el('p', { text: t('origin.explain', { origin }) }),
      target ? el('p', {}, [el('a', { text: t('origin.open', { origin }), attrs: { href: target, class: 'btn btn-primary' } })]) : null,
    ]),
  ]);
}

function render() {
  state.generation += 1;
  const ctx = context(state.generation);
  closeAllDialogs();
  const { session } = state;
  const elsewhere = wrongAddress();
  if (elsewhere) {
    root.replaceChildren(elsewhere);
    document.title = t('origin.title');
    return undefined;
  }
  if (!session.initialized) return renderAuth(root, ctx, 'setup');
  if (state.link) return renderAuth(root, ctx, state.link.kind);
  if (!session.user) return renderAuth(root, ctx, 'login');

  const { user } = session;
  let { section, sub } = currentRoute();
  const allowed = section === 'me' || (section === 'team' && isManager(user)) || (section === 'settings' && user.role === 'owner');
  if (!allowed) {
    window.history.replaceState(null, '', isManager(user) ? '#/team' : '#/me');
    ({ section, sub } = currentRoute());
  }
  const main = el('main', { attrs: { id: 'main', class: 'page', tabindex: '-1' } });
  root.replaceChildren(skipLink(), header(section), main, footer());
  document.title = `${t(`title.${section}`)} · ${session.org.name}`;
  // The old page (and whatever had focus in it) is gone. Start keyboard and
  // screen-reader users at the new content, not back at the top of the document.
  main.focus({ preventScroll: true });
  if (section === 'me') renderMember(main, ctx);
  else if (section === 'team') renderAdmin(main, ctx, sub);
  else renderSettings(main, ctx);
}

async function boot() {
  setLocale(preferredLocale());
  state.link = takeLinkFromFragment();
  try {
    await loadSession();
  } catch {
    root.replaceChildren(el('p', { text: t('error.boot'), attrs: { class: 'boot', role: 'alert' } }));
    return;
  }
  setLocale(preferredLocale(state.session.org?.locale));
  render();
  window.addEventListener('hashchange', () => {
    const link = takeLinkFromFragment();
    if (link) state.link = link;
    render();
  });
}

boot();
