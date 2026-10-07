-- WHY: every restore appends a point, and points carry forward into later generations. A device on an older epoch
-- applies every point after the one that issued its epoch, as one (crates/koloda-sync-proto/PROTOCOL.md, Server
-- restore). A sender a point does not list had nothing in that backup, so its cutoff is 0.
CREATE TABLE IF NOT EXISTS restore_points (
    position integer PRIMARY KEY,
    epoch blob NOT NULL UNIQUE,
    mode text NOT NULL,
    head_hot integer NOT NULL,
    head_cold integer NOT NULL,
    restored_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS restore_cutoffs (
    position integer NOT NULL REFERENCES restore_points (position),
    sender blob NOT NULL,
    last_seq integer NOT NULL,
    PRIMARY KEY (position, sender)
);
