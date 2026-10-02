-- Crumb schema version 2: how people spend, self-recorded entries, batch treats, benefit icons.

-- 'self': people key in what they took and it is deducted at once.
-- 'confirm': people request a benefit and an admin confirms before it is deducted.
-- A database from version 1 that already has benefits was clearly used the confirmed way.
ALTER TABLE organization ADD COLUMN spending TEXT NOT NULL DEFAULT 'self' CHECK (spending IN ('self', 'confirm'));
UPDATE organization SET spending = 'confirm' WHERE EXISTS (SELECT 1 FROM rewards);

-- An optional collectible drawn beside a benefit. Keys are checked against the theme by the server.
ALTER TABLE rewards ADD COLUMN icon_key TEXT CHECK (icon_key IS NULL OR (length(icon_key) BETWEEN 2 AND 32));

-- The ledger gains two kinds and a batch id. SQLite cannot widen a CHECK, so the table is
-- rebuilt: same rows, same ids. Foreign keys are off while this runs (server/db.mjs), so
-- collection_unlocks.grant_id keeps pointing at the same ledger ids through the rename.
--   spend  a member's own entry, negative, no source row
--   void   an admin's correction of a spend, positive, source = the spend
CREATE TABLE ledger_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta_units INTEGER NOT NULL
    CHECK (typeof(delta_units) = 'integer' AND delta_units <> 0 AND abs(delta_units) <= 1000000000000),
  kind TEXT NOT NULL CHECK (kind IN ('grant', 'revoke', 'redeem', 'refund', 'spend', 'void')),
  actor_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  source_id TEXT,
  request_key TEXT,
  batch_id TEXT,
  created_at TEXT NOT NULL,
  CHECK ((kind IN ('grant', 'refund', 'void')) = (delta_units > 0)),
  CHECK ((kind IN ('grant', 'spend')) = (source_id IS NULL)),
  CHECK (batch_id IS NULL OR kind = 'grant')
);
INSERT INTO ledger_v2 (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at)
  SELECT id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at FROM ledger;
DROP TABLE ledger;
ALTER TABLE ledger_v2 RENAME TO ledger;
CREATE UNIQUE INDEX ledger_one_correction ON ledger (kind, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX ledger_by_user ON ledger (user_id, created_at, id);
CREATE INDEX ledger_by_time ON ledger (created_at, id);
CREATE INDEX ledger_by_batch ON ledger (batch_id) WHERE batch_id IS NOT NULL;
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
