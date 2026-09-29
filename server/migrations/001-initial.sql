-- Crumb schema version 1.
--
-- Reward values are integer "units": cents in credit mode, whole points in
-- points mode. No column here ever holds a fractional amount.
-- Times are ISO-8601 UTC strings written by the server, so they sort as text.

CREATE TABLE organization (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  mode TEXT NOT NULL CHECK (mode IN ('credit', 'points')),
  currency TEXT CHECK (currency IN ('CAD', 'USD', 'CNY')),
  unit_label TEXT NOT NULL CHECK (length(unit_label) BETWEEN 1 AND 24),
  threshold_units INTEGER NOT NULL
    CHECK (typeof(threshold_units) = 'integer' AND threshold_units BETWEEN 1 AND 1000000000000),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh-CN')),
  welcome TEXT NOT NULL DEFAULT '' CHECK (length(welcome) <= 500),
  admin_contact TEXT NOT NULL DEFAULT '' CHECK (length(admin_contact) <= 300),
  feedback_url TEXT NOT NULL DEFAULT '' CHECK (length(feedback_url) <= 300),
  logo_png BLOB CHECK (logo_png IS NULL OR length(logo_png) <= 2097152),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  CHECK ((mode = 'credit' AND currency IS NOT NULL) OR (mode = 'points' AND currency IS NULL))
);

-- active = 0 covers both "invited, not joined yet" and "deactivated";
-- deactivated_at tells the two apart. Users are never deleted.
-- Owners and admins sign in with a password. Team members have none: they
-- sign in with personal one-time links. joined_at is when someone first set a
-- password or used their first sign-in link.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE
    CHECK (length(username) BETWEEN 3 AND 64 AND username = lower(username)),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  joined_at TEXT,
  deactivated_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (active = 0 OR (joined_at IS NOT NULL AND deactivated_at IS NULL))
);

-- Only hashes of session tokens and CSRF tokens are stored.
-- user_id is NULL for the short anonymous sessions used before sign-in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_by_user ON sessions (user_id);
CREATE INDEX sessions_by_expiry ON sessions (expires_at);

-- One-time links, stored as hashes: invitations and password resets for owners
-- and admins, sign-in links for team members. A link is only honoured while
-- the person who made it may still manage the account.
CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset', 'signin')),
  user_id TEXT NOT NULL REFERENCES users(id),
  issued_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX tokens_by_user ON tokens (user_id, purpose);

-- Failed sign-in counters, one bucket per account and one per client address.
CREATE TABLE login_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  window_start TEXT NOT NULL
);

-- The ledger is append-only. A balance is the sum of a member's rows.
-- grant and refund add; revoke and redeem subtract. Corrections point at the
-- row they correct through source_id, and each source can be corrected once.
CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta_units INTEGER NOT NULL
    CHECK (typeof(delta_units) = 'integer' AND delta_units <> 0 AND abs(delta_units) <= 1000000000000),
  kind TEXT NOT NULL CHECK (kind IN ('grant', 'revoke', 'redeem', 'refund')),
  actor_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  source_id TEXT,
  request_key TEXT,
  created_at TEXT NOT NULL,
  CHECK ((kind IN ('grant', 'refund')) = (delta_units > 0)),
  CHECK ((kind = 'grant') = (source_id IS NULL))
);
CREATE UNIQUE INDEX ledger_one_correction ON ledger (kind, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX ledger_by_user ON ledger (user_id, created_at, id);
CREATE INDEX ledger_by_time ON ledger (created_at, id);

CREATE TABLE rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  cost_units INTEGER NOT NULL
    CHECK (typeof(cost_units) = 'integer' AND cost_units BETWEEN 1 AND 1000000000000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- reward_name and cost_units are a snapshot taken when the request is made;
-- later catalog edits never change an existing request.
CREATE TABLE redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  reward_id TEXT NOT NULL REFERENCES rewards(id),
  reward_name TEXT NOT NULL,
  cost_units INTEGER NOT NULL
    CHECK (typeof(cost_units) = 'integer' AND cost_units BETWEEN 1 AND 1000000000000),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled', 'rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id),
  resolution_reason TEXT NOT NULL DEFAULT '' CHECK (length(resolution_reason) <= 500),
  CHECK ((status = 'pending') = (resolved_at IS NULL))
);
CREATE INDEX redemptions_by_user ON redemptions (user_id, status);
CREATE INDEX redemptions_by_time ON redemptions (created_at, id);

-- A collection only grows. Each row records which grant unlocked it.
CREATE TABLE collection_unlocks (
  user_id TEXT NOT NULL REFERENCES users(id),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  sprite_key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  grant_id TEXT NOT NULL REFERENCES ledger(id),
  PRIMARY KEY (user_id, ordinal),
  UNIQUE (user_id, sprite_key)
);

-- Stored responses for retried requests, scoped to one actor and one route.
CREATE TABLE idempotency (
  actor_id TEXT NOT NULL REFERENCES users(id),
  route TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, route, key)
);

-- actor_id is NULL only for operations run on the server itself
-- (for example owner recovery from the command line).
CREATE TABLE audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX audit_by_time ON audit (created_at, id);

CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit
BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit
BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;

CREATE TRIGGER collection_no_update BEFORE UPDATE ON collection_unlocks
BEGIN SELECT RAISE(ABORT, 'collection_unlocks is append-only'); END;
CREATE TRIGGER collection_no_delete BEFORE DELETE ON collection_unlocks
BEGIN SELECT RAISE(ABORT, 'collection_unlocks is append-only'); END;

CREATE TRIGGER users_no_delete BEFORE DELETE ON users
BEGIN SELECT RAISE(ABORT, 'users are deactivated, never deleted'); END;

-- A request can move out of pending once; its snapshot never changes.
CREATE TRIGGER redemptions_no_delete BEFORE DELETE ON redemptions
BEGIN SELECT RAISE(ABORT, 'redemptions are append-only'); END;
CREATE TRIGGER redemptions_resolve_once BEFORE UPDATE ON redemptions
WHEN OLD.status <> 'pending'
  OR NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.reward_id IS NOT OLD.reward_id
  OR NEW.reward_name IS NOT OLD.reward_name OR NEW.cost_units IS NOT OLD.cost_units
  OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'a redemption can only be resolved once'); END;
