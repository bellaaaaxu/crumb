import { randomUUID } from 'node:crypto';
import { AppError } from './errors.mjs';
import { writeTransaction } from './db.mjs';
import { writeAudit } from './audit.mjs';
import { MANAGERS, freshActor, requireRole } from './permissions.mjs';
import { assertSameMode, assertUnits } from './units.mjs';
import { withIdempotency } from './idempotency.mjs';
import { theme } from './collections.mjs';
import { bool, id, invalid, oneOf, readObject, text } from './validate.mjs';

export const rewardView = row => ({
  id: row.id,
  name: row.name,
  description: row.description,
  costUnits: row.cost_units,
  active: row.active === 1,
  // Returned as stored, not checked against the theme again (an edit without
  // iconKey keeps it too): if a later theme drops the key, the page should
  // show the benefit with no icon rather than refuse it.
  iconKey: row.icon_key ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const units = ({ optional = false } = {}) => (value, field) => {
  if (value === undefined && optional) return undefined;
  try {
    return assertUnits(value);
  } catch (error) {
    error.field = field;
    throw error;
  }
};

/* Absent = unchanged; null or '' = no icon; otherwise a key of the theme. */
const iconKey = () => (value, field) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !theme.keys.includes(value)) throw invalid(field, 'Choose an icon from the theme, or none.');
  return value;
};

/* Benefits people can ask for. There is no stock count in this version. */
export function listRewards(db, { includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  return db.prepare(`SELECT * FROM rewards ${where} ORDER BY active DESC, cost_units, name, id`).all().map(rewardView);
}

/**
 * Creates a benefit, or edits one when `id` is given (fields left out stay
 * as they are). Editing never changes requests already made: those keep the
 * name and price they were made with. `mode` is the unit a price was read in.
 * A new benefit is created at most once per `key` (the API always sends one);
 * an edit needs none, since saving the same values twice changes nothing.
 */
export function saveReward(db, actor, input, clock = () => Date.now(), { key } = {}) {
  requireRole(actor, MANAGERS);
  const editing = input !== null && typeof input === 'object' && input.id !== undefined;
  const fields = readObject(input, {
    id: id({ optional: true }),
    name: text({ min: 1, max: 80, optional: editing }),
    description: text({ max: 500, optional: true, multiline: true }),
    costUnits: units({ optional: editing }),
    mode: oneOf(['credit', 'points'], { optional: true }),
    active: bool({ optional: editing }),
    iconKey: iconKey(),
  });
  const create = current => {
    assertSameMode(db, fields.mode);
    const at = new Date(clock()).toISOString();
    const row = { id: randomUUID(), name: fields.name, description: fields.description ?? '', cost_units: fields.costUnits,
      active: fields.active ? 1 : 0, icon_key: fields.iconKey ?? null, created_at: at, updated_at: at };
    db.prepare(`INSERT INTO rewards (id, name, description, cost_units, active, icon_key, created_at, updated_at)
                VALUES (@id, @name, @description, @cost_units, @active, @icon_key, @created_at, @updated_at)`).run(row);
    writeAudit(db, { actorId: current.id, action: 'reward.create', targetId: row.id,
      detail: { name: row.name, costUnits: row.cost_units, active: fields.active, iconKey: row.icon_key } }, at);
    return rewardView(row);
  };
  if (!editing && key !== undefined) {
    const { name, description = '', costUnits, mode, active } = fields;
    return withIdempotency(db, actor, 'reward.create', key, { name, description, costUnits, mode, active, iconKey: fields.iconKey ?? null },
      current => ({ status: 201, body: create(current) }), { clock, authorize: () => freshActor(db, actor, MANAGERS) }).body;
  }
  return writeTransaction(db, () => {
    const current = freshActor(db, actor, MANAGERS);
    if (!editing) return create(current);
    assertSameMode(db, fields.mode);
    const at = new Date(clock()).toISOString();
    const existing = db.prepare('SELECT * FROM rewards WHERE id = ?').get(fields.id);
    if (!existing) throw new AppError(404, 'REWARD_NOT_FOUND', 'That benefit does not exist.');
    const next = {
      ...existing,
      name: fields.name ?? existing.name,
      description: fields.description ?? existing.description,
      cost_units: fields.costUnits ?? existing.cost_units,
      active: fields.active === undefined ? existing.active : fields.active ? 1 : 0,
      icon_key: fields.iconKey === undefined ? existing.icon_key : fields.iconKey,
      updated_at: at,
    };
    db.prepare(`UPDATE rewards SET name = @name, description = @description, cost_units = @cost_units,
                active = @active, icon_key = @icon_key, updated_at = @updated_at WHERE id = @id`).run(next);
    const changed = ['name', 'description', 'cost_units', 'active', 'icon_key'].filter(key => next[key] !== existing[key]);
    writeAudit(db, { actorId: current.id, action: 'reward.update', targetId: existing.id, detail: { changed } }, at);
    return rewardView(next);
  });
}
