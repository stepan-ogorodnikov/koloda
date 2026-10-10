-- WHY: the pairing preview shows how many live entities of each kind the space holds and how many bytes its log
-- stores. Counting them on the reader scans every head and every version while the space's pulls wait
-- (crates/koloda-sync-proto/PROTOCOL.md, Pairing). The triggers move the counters with every write, whichever writer
-- makes it, using only primary-key lookups, and `VACUUM INTO` copies them into a backup.
-- A stored version's bytes never change.
ALTER TABLE space ADD COLUMN version_bytes integer NOT NULL DEFAULT 0;

UPDATE space SET version_bytes = (SELECT coalesce(sum(length(bytes)), 0) FROM versions);

CREATE TRIGGER IF NOT EXISTS versions_insert_bytes AFTER INSERT ON versions
BEGIN
    UPDATE space SET version_bytes = version_bytes + length(NEW.bytes);
END;

CREATE TRIGGER IF NOT EXISTS versions_delete_bytes AFTER DELETE ON versions
BEGIN
    UPDATE space SET version_bytes = version_bytes - length(OLD.bytes);
END;

-- An entity is live while it holds a head outside the tombstone group ''. A head's kind, id, and group never change;
-- a newer version of the group updates its lane and seq only.
CREATE TABLE IF NOT EXISTS live_entities (
    kind text PRIMARY KEY,
    count integer NOT NULL
);

INSERT INTO live_entities (kind, count)
SELECT kind, count(DISTINCT id) FROM heads WHERE grp <> '' GROUP BY kind;

CREATE TRIGGER IF NOT EXISTS heads_insert_live AFTER INSERT ON heads
WHEN NEW.grp <> '' AND NOT EXISTS (
    SELECT 1 FROM heads WHERE kind = NEW.kind AND id = NEW.id AND grp <> '' AND grp <> NEW.grp
)
BEGIN
    INSERT INTO live_entities (kind, count) VALUES (NEW.kind, 1)
    ON CONFLICT (kind) DO UPDATE SET count = count + 1;
END;

CREATE TRIGGER IF NOT EXISTS heads_delete_live AFTER DELETE ON heads
WHEN OLD.grp <> '' AND NOT EXISTS (SELECT 1 FROM heads WHERE kind = OLD.kind AND id = OLD.id AND grp <> '')
BEGIN
    UPDATE live_entities SET count = count - 1 WHERE kind = OLD.kind;
END;
