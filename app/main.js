/* Crumb — the self-hosted app. Boots from GET /api/session: the server, not
 * the page, says who is signed in and what their role is. */

import { ApiError, forgetPendingFor, keepPendingOnlyFor, request, setActor, setCsrf } from './api.js';
import { button, closeAllDialogs, el, inWeChat, openDialog, safeUrl, toast, uid } from './dom.js';
import { LANGUAGES, getLocale, has, preferredLocale, rememberLocale, setLocale, t } from './i18n.js';
import { crackMascot, forgetSeen, keepSeenOnlyFor, ovenIntro } from './motion.js';
import { spriteCanvas } from './pixels.js';
import { renderAuth } from './views/auth.js';
import { renderMember } from './views/member.js';
import { renderAdmin } from './views/admin.js';
import { renderSettings } from './views/settings.js';

/* Feedback about Crumb itself goes to the project, unless the organization set its own form. */
const PROJECT_FEEDBACK = 'https://github.com/bellaaaaxu/crumb/issues/new/choose';
const PROJECT_README = 'https://github.com/bellaaaaxu/crumb#readme';

const root = document.getElementById('app');
const state = { session: null, link: null, notice: null, loginName: '', generation: 0, entering: false };

/* Invitation, reset and sign-in links carry their token in the fragment (#invite=…).
 * Take it once and wipe it from the address bar and the history entry. Inside WeChat a
 * sign-in link stays until it is used or left: "Open in Browser" there hands over the
 * address as it is now, and without the link that would be a page no team member can use. */
const LINK_IN_ADDRESS = /^#(invite|reset|signin)=([A-Za-z0-9_-]{43})$/;
const clearLinkFromAddress = () => {
  if (LINK_IN_ADDRESS.test(window.location.hash)) window.history.replaceState(null, '', window.location.pathname + window.location.search);
};

function takeLinkFromFragment() {
  const match = LINK_IN_ADDRESS.exec(window.location.hash);
  if (!match) return null;
  if (!(match[1] === 'signin' && inWeChat())) clearLinkFromAddress();
  return { kind: match[1], token: match[2] };
}

async function loadSession() {
  const session = await request('/api/session');
  setCsrf(session.csrfToken);
  // Unanswered request keys are kept per person, so someone else signing in here never reuses them.
  setActor(session.user?.id);
  // The last-seen balance and the unanswered request keys stay only for whoever is signed in
  // here now. This is also where the page finds out that the server signed someone out: a new
  // sign-in link, deactivation, expiry.
  keepSeenOnlyFor(session.user?.id);
  keepPendingOnlyFor(session.user?.id);
  state.session = session;
  return session;
}

const isManager = user => user?.role === 'owner' || user?.role === 'admin';

/* Three pages: #/me, #/team and #/settings. Only the first segment counts, so the old
 * sub-pages (#/team/members and the like) land on their page; the old activity page's
 * log is on Settings now for owners, and an admin, who may not open Settings, is sent on to
 * the Team page, where they read it. */
function currentRoute() {
  const [section = '', sub] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (section === 'team' && sub === 'activity') return { section: 'settings' };
  return { section };
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
  // The page was rebuilt in the new language; keep the keyboard where it was. On the sign-in
  // pages that is the picker. Signed in, the picker sat in the name menu, which the rebuild
  // closed, so the keyboard starts again at the page's content.
  const picker = document.querySelector('.language select');
  if (picker && picker.getClientRects().length > 0) picker.focus();
  else document.getElementById('main')?.focus({ preventScroll: true });
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
  const leaving = state.session.user?.id;
  try {
    await request('/api/logout', { method: 'POST' });
  } catch {
    // the session is dropped locally either way
  }
  // Before asking the server who is here now, so both go even when that question gets no answer.
  if (leaving) {
    forgetSeen(leaving);
    forgetPendingFor(leaving);
  }
  state.notice = null;
  window.history.replaceState(null, '', window.location.pathname);
  await loadSession();
  render();
}

/* A team member has no password: once signed out, only a new link from an admin gets them
 * back in. Say so before doing it. */
function confirmSignOut() {
  const opened = {};
  const cancel = button(t('common.cancel'), { on: { click: () => opened.close() } });
  const leave = button(t('nav.signOut'), {
    kind: 'danger',
    on: {
      click: () => {
        opened.close();
        signOut();
      },
    },
  });
  Object.assign(opened, openDialog({
    title: t('signOut.title'),
    content: el('div', { attrs: { class: 'stack' } }, [
      el('p', { text: t('signOut.memberNote') }),
      el('div', { attrs: { class: 'dialog-actions' } }, [cancel, leave]),
    ]),
  }));
  cancel.focus();
}

function context(generation) {
  return {
    session: state.session,
    user: state.session.user,
    org: state.session.org,
    notice: state.notice,
    loginName: state.loginName,
    link: state.link,
    /* True on the one render that follows the intro: the tile then slides in. */
    entering: state.entering,
    /* Views open dialogs through the context, so they need no import of their own for it. */
    openDialog,
    /* Resolves true when the error meant the session was gone and the page went back to sign-in. */
    recover: error => recoverFromSessionLoss(error),
    /* A view that finished loading after the person moved on must not paint. */
    isCurrent: () => generation === state.generation,
    render,
    errorText,
    languagePicker,
    async refresh() {
      await loadSession();
      render();
    },
    /* Asks the server again who this browser is; returns that session. */
    renewSession() {
      return loadSession();
    },
    /* Shows the error in the given form area (or as a toast) unless the session is gone. */
    async fail(error, area) {
      if (await recoverFromSessionLoss(error)) return;
      const message = errorText(error);
      if (area) area.show(message);
      else toast(message, { tone: 'error' });
    },
    async onSignedIn() {
      state.link = null;
      state.notice = null;
      state.loginName = '';
      await loadSession();
      render();
    },
    finishLink({ username = '', notice = null } = {}) {
      state.link = null;
      clearLinkFromAddress();
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

/* The name menu. The header is rebuilt on every render, so these look up the menu that is on
 * the page now, and the document listeners below serve every header there will be. */
function closeMenu() {
  const menu = document.querySelector('.topbar .menu');
  const who = document.querySelector('.topbar .who');
  if (!menu || menu.hidden) return;
  // Focus inside a menu that disappears would fall back to the top of the page.
  const hadFocus = menu.contains(document.activeElement);
  menu.hidden = true;
  who?.setAttribute('aria-expanded', 'false');
  if (hadFocus) who?.focus();
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  // A click outside closes it, and so does choosing one of its links (the current page's
  // link changes nothing in the address, so no rebuild would close it).
  if (!target?.closest('.topbar .account') || target.closest('.menu a')) closeMenu();
});

/* The keyboard leaving it closes it too, and stays where it went: an open menu left behind
 * would hang over whatever has the keyboard next. */
document.addEventListener('focusin', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('.topbar .account')) closeMenu();
});

/* Escape closes it and puts the keyboard back on the name. A dialog's Escape is its own. */
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || (event.target instanceof Element && event.target.closest('dialog'))) return;
  const menu = document.querySelector('.topbar .menu');
  if (!menu || menu.hidden) return;
  closeMenu();
  document.querySelector('.topbar .who')?.focus();
});

/* One line: the mascot or logo and the team name; for managers, pills on wide screens; the
 * person's name on the right, opening a small menu with language and sign out (and, on
 * phones, the pills). */
function header(section) {
  const { user, org } = state.session;
  const links = [['me', t('nav.mine')]];
  if (isManager(user)) links.push(['team', t('nav.team')]);
  if (user.role === 'owner') links.push(['settings', t('nav.settings')]);
  const navLinks = () => links.map(([key, label]) => el('a', {
    text: label, attrs: { href: `#/${key}`, 'aria-current': key === section ? 'page' : false },
  }));
  const mascot = el('button', {
    attrs: { type: 'button', class: 'mascot', 'aria-label': 'Crumb' },
    on: { click: event => crackMascot(event.currentTarget) },
  }, [spriteCanvas('laopo', 3)]);
  const brand = el('div', { attrs: { class: 'brand' } }, [
    org.hasLogo ? el('img', { attrs: { src: '/api/org/logo', alt: '', class: 'brand-logo', width: 32, height: 32 } }) : mascot,
    el('span', { text: org.name, attrs: { class: 'brand-name' } }),
  ]);
  const menuId = uid('menu');
  const menu = el('div', { attrs: { id: menuId, class: 'menu', hidden: true } }, [
    isManager(user) ? el('nav', { attrs: { class: 'menu-nav', 'aria-label': t('nav.label') } }, navLinks()) : null,
    languagePicker(),
    button(t('nav.signOut'), {
      kind: 'quiet',
      on: {
        click: () => {
          // Closed first, so the confirmation hands focus back to the name, which stays visible.
          closeMenu();
          if (user.role === 'member') confirmSignOut();
          else signOut();
        },
      },
    }),
  ]);
  // A disclosure, not an ARIA menu: it holds links, a select and a button, not menu items.
  const who = el('button', {
    attrs: { type: 'button', class: 'who', 'aria-expanded': 'false', 'aria-controls': menuId, 'aria-label': t('nav.menu', { name: user.displayName }) },
    on: {
      click: () => {
        if (!menu.hidden) {
          closeMenu();
          return;
        }
        menu.hidden = false;
        who.setAttribute('aria-expanded', 'true');
        // The first item that is showing: on wide screens the pills stand in the header instead.
        [...menu.querySelectorAll('a, select, button')].find(node => node.getClientRects().length > 0)?.focus();
      },
    },
  }, [el('span', { text: user.displayName })]);
  return el('header', { attrs: { class: 'topbar' } }, [
    brand,
    isManager(user) ? el('nav', { attrs: { class: 'main-nav', 'aria-label': t('nav.label') } }, navLinks()) : null,
    el('div', { attrs: { class: 'account' } }, [who, menu]),
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
  // The tile slides in once, on the render that follows the intro; later renders keep still.
  state.entering = false;
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
  let { section } = currentRoute();
  const allowed = section === 'me' || (section === 'team' && isManager(user)) || (section === 'settings' && user.role === 'owner');
  if (!allowed) section = isManager(user) ? 'team' : 'me';
  // The address names the page shown, also after an old sub-page address such as #/team/members.
  if (window.location.hash !== `#/${section}`) window.history.replaceState(null, '', `#/${section}`);
  const main = el('main', { attrs: { id: 'main', class: 'page', tabindex: '-1' } });
  root.replaceChildren(skipLink(), header(section), main, footer());
  document.title = `${t(`title.${section}`)} · ${session.org.name}`;
  // The old page (and whatever had focus in it) is gone. Start keyboard and
  // screen-reader users at the new content, not back at the top of the document.
  main.focus({ preventScroll: true });
  if (section === 'me') renderMember(main, ctx);
  else if (section === 'team') renderAdmin(main, ctx);
  else renderSettings(main, ctx);
}

/* These files with no Crumb server behind them: the project's GitHub Pages site publishes the
 * whole repository, this folder included. Say what the page is instead of "try again". */
function noServer() {
  document.title = t('static.title');
  return el('main', { attrs: { id: 'main', class: 'auth', tabindex: '-1' } }, [
    el('div', { attrs: { class: 'auth-card' } }, [
      el('h1', { text: t('static.title'), attrs: { class: 'page-title' } }),
      el('p', { text: t('static.explain') }),
      el('p', {}, [el('a', { text: t('static.demo'), attrs: { href: '../', class: 'btn btn-primary' } })]),
      el('p', {}, [el('a', { text: t('static.deploy'), attrs: { href: PROJECT_README } })]),
    ]),
  ]);
}

async function boot() {
  setLocale(preferredLocale());
  state.link = takeLinkFromFragment();
  try {
    await loadSession();
  } catch (failure) {
    root.replaceChildren(failure instanceof ApiError && failure.status === 404
      ? noServer()
      : el('p', { text: t('error.boot'), attrs: { class: 'boot', role: 'alert' } }));
    return;
  }
  setLocale(preferredLocale(state.session.org?.locale));
  // Once per page load, for someone already signed in: the intro, then the tile slides in.
  // A sign-in link or the sign-in page goes straight to its form.
  if (state.session.user && !state.link) {
    state.entering = true;
    await ovenIntro({ title: t('intro.title'), skip: t('intro.skip') });
  }
  render();
  window.addEventListener('hashchange', () => {
    const link = takeLinkFromFragment();
    if (link) state.link = link;
    render();
  });
}

boot();
