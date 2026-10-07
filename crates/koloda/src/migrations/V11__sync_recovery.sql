-- WHY: the highest stamp that is no longer only local: every stamp apply observed, and every cohort that went out in a
-- push. A re-stamp after a clock correction may issue below `last_hlc`, but never below this
-- (crates/koloda-sync-proto/PROTOCOL.md, Hybrid logical clock, Cohorts).
ALTER TABLE sync_state ADD COLUMN stable_hlc integer NOT NULL DEFAULT 0;

-- WHY: a re-bootstrap marks every create its snapshot and catch-up deliver with the open generation. A create left
-- unmarked when it ends is absent on the server, unless it is still waiting to be sent. Marks of an earlier generation
-- protect nothing, so nothing has to clear them (crates/koloda-sync-proto/PROTOCOL.md, Re-bootstrap).
ALTER TABLE sync_state ADD COLUMN rebase_generation integer NOT NULL DEFAULT 0;

ALTER TABLE sync_state ADD COLUMN is_rebasing integer NOT NULL DEFAULT 0;

ALTER TABLE sync_origins ADD COLUMN seen_generation integer NOT NULL DEFAULT 0;

-- WHY: a cohort is `fixed` both when a member was consumed and when a lost reply left it unknown. Only the first keeps
-- its stamp when a file that is behind switches device id, and a consumed member that already left the outbox has no
-- pending seq whose receipt could show it (crates/koloda-sync-proto/PROTOCOL.md, Behind its own record).
ALTER TABLE sync_cohorts ADD COLUMN has_consumed integer NOT NULL DEFAULT 0;

-- WHY: the fork request's nonce, stored before the call and cleared by the switch to the new id. A file that stopped in
-- between forks again with it and gets the same record back (crates/koloda-sync-proto/PROTOCOL.md, Behind its own
-- record).
ALTER TABLE sync_state ADD COLUMN fork_nonce blob;
