-- Server-wide state: the setup token, spaces, and enrolled devices (crates/koloda-server/README.md).
CREATE TABLE IF NOT EXISTS setup (
    id integer PRIMARY KEY CHECK (id = 1),
    token_hash blob NOT NULL,
    created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
    id blob PRIMARY KEY,
    name text NOT NULL,
    created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id blob PRIMARY KEY,
    space_id blob NOT NULL REFERENCES spaces (id),
    token_hash blob NOT NULL UNIQUE,
    name text NOT NULL,
    platform text NOT NULL,
    created_at integer NOT NULL,
    last_seen integer NOT NULL
);

CREATE INDEX IF NOT EXISTS devices_space ON devices (space_id);

-- WHY: a lost reply to space creation is retried with the same nonce and must return the same token.
-- The token is kept in clear only until the replay window closes.
CREATE TABLE IF NOT EXISTS space_creations (
    nonce blob PRIMARY KEY,
    space_id blob NOT NULL,
    device_id blob NOT NULL,
    token text NOT NULL,
    epoch blob NOT NULL,
    expires_at integer NOT NULL
);

-- WHY: the claim token is kept in clear until the code expires, so a claim retried with the same nonce after a lost
-- reply gets the same device back.
CREATE TABLE IF NOT EXISTS pairings (
    code_hash blob PRIMARY KEY,
    space_id blob NOT NULL REFERENCES spaces (id),
    issuer blob REFERENCES devices (id),
    expires_at integer NOT NULL,
    hint blob,
    claim_nonce blob,
    claim_device blob,
    claim_token text
);
