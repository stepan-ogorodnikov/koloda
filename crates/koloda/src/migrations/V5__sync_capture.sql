-- WHY: sync bookkeeping lives in the shared series, so web databases create these tables too; only the
-- desktop store writes them (crates/koloda-sync-proto/PROTOCOL.md, Client state).
CREATE TABLE IF NOT EXISTS sync_state (
	id integer PRIMARY KEY NOT NULL CHECK (id = 1),
	device_id blob NOT NULL,
	last_hlc integer NOT NULL,
	next_sender_seq integer NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_stamps (
	kind text NOT NULL,
	id text NOT NULL,
	group_name text NOT NULL,
	hlc integer NOT NULL,
	stamp_device blob NOT NULL,
	sender blob NOT NULL,
	sender_seq integer NOT NULL,
	product_ts integer,
	synthetic integer NOT NULL,
	PRIMARY KEY (kind, id, group_name)
);

CREATE TABLE IF NOT EXISTS sync_origins (
	kind text NOT NULL,
	id text NOT NULL,
	group_name text NOT NULL,
	hlc integer NOT NULL,
	stamp_device blob NOT NULL,
	sender blob NOT NULL,
	sender_seq integer NOT NULL,
	legacy_product_ts_floor integer,
	PRIMARY KEY (kind, id, group_name)
);

CREATE TABLE IF NOT EXISTS sync_outbox (
	sender_seq integer PRIMARY KEY NOT NULL,
	kind text NOT NULL,
	id text NOT NULL,
	group_name text,
	commit_id blob NOT NULL,
	envelope blob NOT NULL,
	digest blob NOT NULL,
	in_flight integer NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_outbox_kind_id_group_name_idx ON sync_outbox(kind, id, group_name);

CREATE TABLE IF NOT EXISTS sync_cohorts (
	commit_id blob PRIMARY KEY NOT NULL,
	state text NOT NULL,
	hlc integer NOT NULL,
	stamp_device blob NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_tombstones (
	kind text NOT NULL,
	id text NOT NULL,
	hlc integer NOT NULL,
	stamp_device blob NOT NULL,
	sender blob NOT NULL,
	sender_seq integer NOT NULL,
	successor text,
	PRIMARY KEY (kind, id)
);
