-- Crumb schema version 4: a short note on how to use the balance.

-- A few lines the owner writes in Settings (what the balance can be used for, how to get it,
-- any limits); members see it under their "I grabbed something" button when people record
-- their own spending. At most 200 characters, counted the way the server counts what it
-- accepts: SQLite's length() counts characters, so a CJK character, a line break and an emoji
-- are one each. Empty means no note. Teams that existed before this version have none.
ALTER TABLE organization ADD COLUMN usage_note TEXT NOT NULL DEFAULT '' CHECK (length(usage_note) <= 200);
