-- WHY: the highest stamp that is no longer only local: every stamp apply observed, and every cohort that went out in a
-- push. A re-stamp after a clock correction may issue below `last_hlc`, but never below this
-- (crates/koloda-sync-proto/PROTOCOL.md, Hybrid logical clock, Cohorts).
ALTER TABLE sync_state ADD COLUMN stable_hlc integer NOT NULL DEFAULT 0;
