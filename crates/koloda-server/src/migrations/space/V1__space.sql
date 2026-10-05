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

-- The highest seq assigned in each lane. Kept apart from `versions`, because compaction may remove the top version.
CREATE TABLE IF NOT EXISTS lanes (
    lane text PRIMARY KEY,
    head integer NOT NULL
);

INSERT OR IGNORE INTO lanes (lane, head) VALUES ('hot', 0), ('cold', 0);

-- Accepted envelope bytes at their lane seq. A version stays only while a head references it (compaction on write).
-- `parent` and `template_ref` come from the header; deletes cascade along them.
CREATE TABLE IF NOT EXISTS versions (
    lane text NOT NULL,
    seq integer NOT NULL,
    kind text NOT NULL,
    id text NOT NULL,
    grp text NOT NULL,
    parent text,
    template_ref text,
    hlc integer NOT NULL,
    stamp_device blob NOT NULL,
    sender blob NOT NULL,
    sender_seq integer NOT NULL,
    digest blob NOT NULL,
    bytes blob NOT NULL,
    PRIMARY KEY (lane, seq)
);

CREATE INDEX IF NOT EXISTS versions_parent ON versions (kind, parent) WHERE parent IS NOT NULL;

CREATE INDEX IF NOT EXISTS versions_template ON versions (template_ref) WHERE template_ref IS NOT NULL;

-- One live version per (kind, id, group): the highest (hlc, stamp_device), which is also the highest seq.
CREATE TABLE IF NOT EXISTS heads (
    kind text NOT NULL,
    id text NOT NULL,
    grp text NOT NULL,
    lane text NOT NULL,
    seq integer NOT NULL,
    PRIMARY KEY (kind, id, grp)
);

-- INVARIANT: a fence is permanent. Every tombstoned entity and every card a cascade removed stays here, so no later
-- create or update of them applies.
CREATE TABLE IF NOT EXISTS deleted_ids (
    kind text NOT NULL,
    id text NOT NULL,
    PRIMARY KEY (kind, id)
);

CREATE TABLE IF NOT EXISTS senders (
    sender blob PRIMARY KEY,
    last_seq integer NOT NULL,
    last_digest blob NOT NULL
);

-- INVARIANT: a receipt is immutable; a same-digest retry of a consumed seq returns exactly this outcome.
CREATE TABLE IF NOT EXISTS receipts (
    sender blob NOT NULL,
    sender_seq integer NOT NULL,
    digest blob NOT NULL,
    outcome blob NOT NULL,
    PRIMARY KEY (sender, sender_seq)
);

-- Creates a sender had held: its later envelopes that name one of these entities are held too (held { dependency }).
CREATE TABLE IF NOT EXISTS sender_holds (
    sender blob NOT NULL,
    kind text NOT NULL,
    id text NOT NULL,
    PRIMARY KEY (sender, kind, id)
);
