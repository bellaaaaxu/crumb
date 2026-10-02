/* The audit log, newest first, to read only: at the bottom of Settings for owners, and of the
 * Team page for admins, who have no Settings. Rows hold ids; names are looked up so the log
 * reads as sentences. */

import { request, requestAll } from '../api.js';
import { el } from '../dom.js';
import { formatDateTime, getLocale, has, t } from '../i18n.js';
import { formatUnits } from '../format.js';
import { pager, section } from './shared.js';

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

export async function activitySection(ctx) {
  const money = units => formatUnits(units, ctx.org, getLocale());
  const [page, people] = await Promise.all([request('/api/admin/audit?limit=25'), requestAll('/api/admin/members')]);
  const names = new Map(people.map(person => [person.id, person.displayName]));
  const toRow = item => el('li', { attrs: { class: 'row' } }, [
    el('div', { attrs: { class: 'row-main' } }, [
      el('p', { text: describe(item, money, names), attrs: { class: 'row-title' } }),
      el('p', { text: `${item.actor ? item.actor.displayName : t('audit.system')} · ${formatDateTime(item.createdAt)}`, attrs: { class: 'muted small' } }),
    ]),
  ]);
  const list = el('ul', { attrs: { class: 'rows' } }, page.items.map(toRow));
  return section(t('settings.activityTitle'), [
    el('p', { text: t('audit.intro'), attrs: { class: 'muted small' } }),
    list,
    pager(ctx, list, page, cursor => `/api/admin/audit?limit=25&cursor=${encodeURIComponent(cursor)}`, toRow),
  ], { className: 'wide' });
}
