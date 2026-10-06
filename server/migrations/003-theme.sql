-- Crumb schema version 3: a collection theme per team.

-- Which collection the team's members fill, and which mascot the app shows. Only the shape is
-- checked here: which themes exist is decided by the theme list files in themes/, read by
-- server/themes.mjs, so adding a theme never rebuilds this table. A database whose team uses
-- a theme the running version does not ship is refused when it is opened or restored.
-- Teams that existed before this version are on 'default'.
ALTER TABLE organization ADD COLUMN theme TEXT NOT NULL DEFAULT 'default' CHECK (length(theme) BETWEEN 2 AND 32);
