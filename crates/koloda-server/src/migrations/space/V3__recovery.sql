-- WHY: a collection pass removes tombstones every active device and every live lease has passed. The horizon is the
-- highest seq a pass removed: a pull from below it, or a push from a device whose cursor is below it, may have missed
-- a delete and is refused (crates/koloda-sync-proto/PROTOCOL.md, Pull cursor, Devices).
ALTER TABLE lanes ADD COLUMN gc_horizon integer NOT NULL DEFAULT 0;

-- WHY: a lease's device catches up from the `hot` head the lease saw, so every tombstone above it stays until the
-- lease ends.
ALTER TABLE leases ADD COLUMN head_hot integer NOT NULL DEFAULT 0;
