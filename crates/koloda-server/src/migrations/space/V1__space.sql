-- One space: its epoch, the accepted write schema per kind, and its envelope log (crates/koloda-sync-proto/PROTOCOL.md,
-- Topology and server state).
CREATE TABLE IF NOT EXISTS space (
    id integer PRIMARY KEY CHECK (id = 1),
    space_id blob NOT NULL,
    epoch blob NOT NULL,
    created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS write_schema (
    kind text PRIMARY KEY,
    schema integer NOT NULL
);
