import en from './locales/en.js';
import zhCN from './locales/zh-CN.js';

const DICTIONARIES = { en, 'zh-CN': zhCN };
export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
];
const STORE_KEY = 'crumb.locale';

let current = 'en';

export function setLocale(code) {
  current = Object.hasOwn(DICTIONARIES, code) ? code : 'en';
  document.documentElement.lang = current;
}

export const getLocale = () => current;

/* Placeholders look like {name}; a missing key falls back to English, then to the key. */
export function t(key, params = {}) {
  const template = DICTIONARIES[current][key] ?? DICTIONARIES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}

export const has = key => Object.hasOwn(DICTIONARIES[current], key) || Object.hasOwn(DICTIONARIES.en, key);

/* The few sentences that name what the collection is made of follow the team's collection
 * theme. A theme may have its own version of each, in both locale files, keyed as the base key
 * plus `.<theme id>` (`grant.unlocked.bakery`); the Pastry shop (`default`) has none and uses
 * the base keys. tests/i18n.test.mjs checks that every such key has its base key with the same
 * placeholders, and that the app looks each key listed here up only through themed(). */
export const THEMED_KEYS = ['setup.thresholdCredit', 'setup.thresholdPoints', 'grant.unlocked', 'revoke.explain', 'members.roleDetail.member'];

/* The theme's own version when there is one; the base sentence otherwise, also for a missing or
 * unknown theme id. Never look a theme's version up with t() alone: when nothing matches, t()
 * shows the key itself. */
export function themed(key, themeId, params) {
  const own = `${key}.${themeId}`;
  return has(own) ? t(own, params) : t(key, params);
}

/* A person's own choice wins; otherwise the organization's default.
 * The browser keeps this choice and, for this device only, three other things: that the
 * home-screen tip was dismissed (views/member.js); and, for the person signed in here now,
 * the keys of their requests still waiting for an answer with a fingerprint of each change,
 * used for seven days at most (pending.js), and the balance, pastry count and total received
 * they last saw, which the page animates from (motion.js). The fingerprint of a small change,
 * such as an amount, could be worked out by someone using this browser, so the keys go with
 * the numbers as soon as the page finds no one, or someone else, signed in here: after signing
 * out, and after the server ends the session. Never accounts, passwords or anyone's history. */
export function preferredLocale(orgLocale) {
  try {
    const saved = window.localStorage.getItem(STORE_KEY);
    if (Object.hasOwn(DICTIONARIES, saved)) return saved;
  } catch {
    // storage unavailable (private mode): fall through
  }
  if (Object.hasOwn(DICTIONARIES, orgLocale)) return orgLocale;
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function rememberLocale(code) {
  try {
    window.localStorage.setItem(STORE_KEY, code);
  } catch {
    // not saved; the choice still applies until the page is closed
  }
}

export const formatDate = iso => new Intl.DateTimeFormat(current, { dateStyle: 'medium' }).format(new Date(iso));
export const formatDateTime = iso =>
  new Intl.DateTimeFormat(current, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
