import { writeTransaction } from './db.mjs';
import { writeAudit } from './audit.mjs';
import { requireOrg } from './org.mjs';
import { MANAGERS, requireRole } from './permissions.mjs';
import { formatUnits } from './units.mjs';

const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * One CSV field, always quoted. A value a spreadsheet could run as a formula
 * — first non-blank character = + - @, or a leading control character —
 * gets a leading apostrophe. Plain numbers such as "-5000" stay numbers.
 */
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (!PLAIN_NUMBER.test(text) && (/^[\u0000-\u001F]/.test(text) || /^\s*[=+\-@]/.test(text))) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const HEADER = ['time', 'member', 'username', 'type', 'units', 'amount', 'reason', 'recorded_by', 'related_id', 'entry_id'];

/**
 * The whole ledger, oldest first, for owners and admins. It is a readable
 * copy, not a backup: restoring needs the database backup in docs/OPERATIONS.md.
 */
export function exportLedger(db, actor, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  const org = requireOrg(db);
  const unit = { mode: org.mode, currency: org.currency, unitLabel: org.unit_label };
  const rows = db.prepare(`SELECT l.id, l.kind, l.delta_units, l.reason, l.source_id, l.created_at,
      m.display_name AS member_name, m.username AS member_username, a.display_name AS actor_name
    FROM ledger l JOIN users m ON m.id = l.user_id LEFT JOIN users a ON a.id = l.actor_id
    ORDER BY l.created_at, l.id`).all();
  const lines = [HEADER.map(csvCell).join(',')];
  for (const row of rows) {
    // A true minus sign (U+2212) keeps the display column readable without looking like a formula.
    const shown = formatUnits(row.delta_units, unit, org.locale).replace(/^-/, '−');
    lines.push([row.created_at, row.member_name, row.member_username, row.kind, row.delta_units, shown,
      row.reason, row.actor_name, row.source_id, row.id].map(csvCell).join(','));
  }
  writeTransaction(db, () => writeAudit(db, { actorId: actor.id, action: 'ledger.export', detail: { rows: rows.length } },
    new Date(clock()).toISOString()));
  return `﻿${lines.join('\r\n')}\r\n`;
}
