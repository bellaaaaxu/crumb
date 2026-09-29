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

/* A person's own choice wins; otherwise the organization's default.
 * Only this preference is kept in the browser — never accounts or balances. */
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
