# Sync phase-1 review fixes

Status: ready

## Intent

Fix what the phase-1 review of the sync engine found, before the desktop UI exposes it.
The review read `main` at `cea0de69` on 2026-10-09 against `crates/koloda-sync-proto/PROTOCOL.md`.
Its report sits in `tmp/`, which git ignores, so this file carries everything the plan needs.
The owner and the agent went through the report and checked it against the code on 2026-10-09.

Findings kept, numbered as in the report:

- D1. A bootstrap restarted on a new lease never sees a tombstone committed between the two leases' heads.
  The snapshot leaves tombstones out, and catch-up starts at the new lease's head.
  Quitting during a first sync and opening the app later is such a restart.
  A joiner keeps the deleted entity for good.
  A re-bootstrap keeps it too, because the first lease already marked its create as seen.
- D2. `drop-envelope` of a `cards.content` version that is not the head still relinks the card's attachments
  through its create.
  The live head's images are then unlinked, and collected once the stale-device window passes.
- D3. Detach deletes the token, then marks the file detached.
  A stop between the two leaves an attached file with no token, which no engine call can detach or pair again.
- D4. Two overlapping fork requests with one nonce each write a new token hash.
  The one that writes last wins, so the token the file stored can be dead.
- D6. An upload checks the quota before it takes the writer lock and inserts after, so it can commit over quota.
- D7. Claim and space creation mint a nonce per host call.
  A claim that lost every reply, or a stop after the server committed it, burns the code on the next try.
  The same on creation makes a second space.
  Re-attach makes several calls after its claim and records nothing until the switch, so any error there burns the
  code as well.
  A retry cannot even reach the claim today: the server answers the preview of a claimed code `pairing_failed`.
- D8. A push reply that moves the skew estimate past the tolerance is settled, and the next batch still goes out.
- D9. When a cold page or an image spends the metered allowance, nothing records the pause if heal or backfill
  still has rows.
  Heal and backfill then stop with no status until the network changes.
- D10. A push waiting on server time does not wake the runner.
  It waits for the next poll, up to 5 minutes later while the events socket is up.
  `sync-followups` recorded this and left it.
- D11. Re-attach fails on `epoch_changed` from its old-device lookup, after the claim.
- Found in the check: `detach` fails on `401 unknown_device` with the file's own epoch.
  A file the server no longer knows, which is D4's outcome, can then be neither detached nor paired again.

Done when:

- a bootstrap that restarts on a new lease ends without what the space deleted between the leases, for a join and
  for a re-bootstrap;
- dropping a superseded content version leaves the live head's attachment refs alone;
- a detach that stops half-way, a lost token, and an `unknown_device` reply each leave a file that pairs again;
- fork, claim, and space creation carry a client-minted token, and retries in any order leave that token working;
- a join, re-attach, or space creation that loses its replies, or stops after the server committed, finishes on the
  next try with the same code and the same device;
- an upload that loses a race with a push at the quota is refused `507` and stores nothing;
- a push stops before its next batch once a reply puts skew past the tolerance;
- a spent metered allowance with heal or backfill left shows the pause;
- the runner pushes when a push wait ends, not at the next poll;
- a restore that lands during a re-attach is applied, and the re-attach finishes;
- `bun run check:push` is green and runs the new tests.

## Scope

In:

- `koloda-sync`: bootstrap, fork, pairing and re-attach, space creation, detach, push, metered accounting, runner.
- `koloda`: marks per lease, absence cleanup at the end of a join bootstrap, the pending enrollment of question 4.
- `koloda-sync-proto`: enrollment bodies with a client-minted token, the token format, shared code normalization.
- `koloda-server`: claim, creation, and fork with client tokens (server migration `V4`), the `drop-envelope`
  relink, and the upload room check.
- `PROTOCOL.md`, the crate READMEs, and `agents/RUST.md`, each with the item that makes them true.

Out:

- D5, the join probe reading each id in its own transaction (question 7).
- The report's "stale device without a lapsed lease" form of D1.
  `collect_tombstones` keeps every tombstone above a live lease's `head_hot`, so it cannot happen.
- The report's lowest-lease-head floor for D1 (question 2).
- NAPI `cmd_sync_*`, Settings → Sync, the join wizard, and the sync product spec (the desktop UI task, last).
- Chunked deletes, the web host, and mobile.

## Open questions

The owner took every recommendation on 2026-10-09.

- [x] 1. Area guides?
  Answer: the owner left the choice to the agent.
  `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`, `agents/CODE-DOCUMENTATION.md`,
  `agents/CODE-STYLE.md`, `agents/TESTING.md`, `agents/RUST.md`, `agents/DB.md` (item 2 adds a server migration,
  item 4 a client one), `agents/BACKWARDS-COMPATIBILITY.md` (wire bodies change outright), and `agents/REVIEW.md`
  for self-review.
  Also `crates/koloda/README.md`, `crates/koloda-sync/README.md`, `crates/koloda-server/README.md`,
  `crates/koloda-sync-proto/PROTOCOL.md` and its README.
- [x] 2. How is D1 fixed?
  Answer: by marks, for both kinds of bootstrap.
  - Every lease starts a new mark generation before its first page.
    A create a lease delivered counts only if the lease the bootstrap finishes on delivered it too.
  - A join bootstrap ends with the same absence cleanup as a re-bootstrap.
  - Joins are safe for it because claiming clears every `sync_*` table, and so does an authoritative reset.
    A joiner therefore holds no create origin except those this bootstrap's leases delivered.
    Local rows have none, and a create still in the outbox or held is skipped as today.
  - The alternative was a persisted floor, the lowest `head_hot` of the bootstrap's leases, for catch-up.
    It needs the tombstone to still be on the server, which a device that does not pin GC cannot promise.
- [x] 3. How is D4 fixed?
  Answer: the client mints the token for fork, claim, and space creation, and sends it.
  - Retries carry the same token, so their order stops mattering and nothing rewrites a token hash.
  - The server keeps only hashes; the plaintext claim and creation tokens it holds today go.
  - The agent added two details, which the owner accepted:
    - Replies stop carrying a token, since the client already holds it.
    - A known nonce with another token is refused and writes nothing.
      A claim answers `pairing_failed`, as for any other caller; fork and creation answer `400 bad_request`.
- [x] 4. Where does a pending claim or creation wait between host calls?
  It needs the nonce and the token, and for a claim the normalized code, the space id, and the server URL.
  A blank file has no `sync_state` row yet.
  Answer: the nonce and details in the file, the token in the secret store.
  - A new singleton table, `sync_enrolling`, holds the kind, nonce, code hash, space id, and server URL.
  - The token goes under the secret key `sync.pending_token.{nonce}`, written before the row.
    A stop between the two then leaves a token nobody names, never a nonce without its token.
  - The transaction that records the enrollment clears the row.
  - Fork already keeps its nonce in the file (`sync_state.fork_nonce`), and uses the same token key in item 2.
  The alternative kept everything in the secret store, under a key named by the code, and one key for creation.
  It needs no client migration, but two files on one machine joining with one code would share a device.
- [x] 5. D8: what happens to the batch whose reply moved the skew?
  Answer: settle it, then stop before the next batch with `ClockSkew`.
  Its outcomes are the server's decision and do not depend on the client's clock.
  What the pause protects is the unsent `local` cohorts, which re-stamp once the clock is right.
  The alternative, the report's, left that batch in flight unsettled, for the next cycle to resend.
- [x] 6. Does `unknown_device` with the file's own epoch detach the file by itself?
  That reply means the server lost or replaced the device record: D4's outcome, or damage on the server.
  Answer: no.
  A cycle keeps reporting `UnknownDevice`, and `detach` then succeeds without the server.
  The user sees the problem before anything on the device changes.
  The alternative detached on the reply, as `401 revoked` does.
- [x] 7. Drop D5?
  Answer: yes.
  Add remints live and fenced ids alike, and the live-or-fenced answer matters only for the two seed ids.
  A fence is permanent, so an id only goes from unknown to known.
  A mixed read therefore remints what a consistent one would, except an id that became known mid-probe.
  That is the protocol's accepted edge of two copies probing at the same moment.
  The probe also runs in chunks, so one transaction per chunk would not give one snapshot anyway.

## Plan

- [x] 1. Clean up after a restarted bootstrap by marks
  Goal (per question 2):
  - Every bootstrap lease, join or re-bootstrap, raises `sync_state.rebase_generation` before its first page
    applies.
    The re-bootstrap barrier still opens once; only the marks are per lease.
  - Apply marks a create's origin while a join bootstrap or a re-bootstrap is open (`mark_seen` in `apply.rs`).
  - `finish_bootstrap` runs the absence cleanup `finish_rebase` runs (`absent_batch`, `remove_entity`), in the
    transaction that clears the bootstrap flag.
  - `bootstrap_once` in `crates/koloda-sync/src/bootstrap.rs` calls the new generation step after the room checks
    pass and before `fill`.
  - `PROTOCOL.md` §Bootstrap (union, lapsed lease), §Re-bootstrap, and §Conformance cases state the rule.
    So do the koloda README and the Re-bootstrap and Join notes in `agents/RUST.md`.
  Constraints:
  - A join still never removes a local row: an entity with no create origin, a create in the outbox, and a held
    create all stay.
  - No new column.
  - Tests that assert a lapse keeps generation 1 assert instead that the barrier stays open.
  Done when:
  - a `koloda` integration test: a join bootstrap whose second lease lacks an entity the first delivered removes it
    with its descendants, and keeps a local row, an outboxed create, a held create, and a seed row at stamp zero;
  - an engine test: B's join applies deck D from its first lease, the lease lapses, A deletes D, and B ends without
    D after its second lease;
  - the same engine test for a re-bootstrap;
  - `bun run check:push` green.
  Commit: Remove what a restarted bootstrap's earlier lease left behind
  Depends on: none

- [x] 2. Mint enrollment tokens on the client
  Goal (per question 3):
  - `koloda-sync-proto`: `CreateSpace`, `ClaimPairing`, and `ForkDevice` carry `token`, and `Enrollment` drops it.
    The token format, 32 random bytes as lowercase hex as the server mints today, and a check for it live there.
  - Server: a malformed token is refused `400 bad_request`; only its hash is stored.
  - Server: a known nonce is answered from its record only when the token hashes to that device's hash.
    Otherwise a claim fails `pairing_failed`, and fork and creation answer `400 bad_request`.
    No retry writes a token hash.
  - Server migration `V4__client_tokens.sql` drops `pairings.claim_token` and swaps `space_creations.token` for
    `token_hash`; creation rows live 10 minutes, so it may empty that table.
  - Client: claim and creation mint a token per host call for now; item 4 keeps them across calls.
  - Client: fork mints its token with its nonce.
    It writes the token to the secret store under `sync.pending_token.{nonce}` before the nonce is stored.
    It reuses both until the switch, then removes the key.
    A stored nonce whose key is gone is replaced by a new nonce and token.
  - `PROTOCOL.md` §Devices (the token row, fork step 3), §Endpoints, §Bodies, and §Pairing state the rules.
    So do the server and engine READMEs and the Device switch note in `agents/RUST.md`.
  Constraints:
  - `agents/DB.md` for the server migration.
  - Server and engine test helpers keep the token they mint.
  - `a_fork_retried_with_its_nonce_returns_the_same_device_with_a_fresh_token` changes to the same token.
  Done when:
  - server tests: two fork requests with one nonce and token, answered in either order, return one device, and the
    token authenticates after both; a third with another token is refused and changes nothing;
  - server tests: a claim retried with its nonce and token returns the same device, and with another token fails
    `pairing_failed`; a creation retried likewise; a malformed token is refused;
  - `a_crash_between_the_fork_reply_and_the_switch_makes_one_fork_record` passes with the token the file stored
    before the call;
  - `bun run check:push` green.
  Commit: Mint enrollment tokens on the client
  Depends on: none

- [x] 3. Apply a restore met anywhere in a re-attach
  Goal:
  - In `reattach`, every call after the claim and before `switch_device` handles `Restored` the same way.
    It calls `apply_restore`, which holds an authoritative one, moves the session to the restore's epoch, and repeats
    the call.
    That covers the old-device lookup and the receipts.
  - The preview-epoch comparison and the lookup of the new device go.
    The first call after the claim names the stored epoch and meets any restore itself.
  - The old-device lookup still reads `NotFound` as no seqs consumed.
  - `PROTOCOL.md` §Re-attach states the rule.
  Done when:
  - an engine test: a restore from a backup that holds the new device lands after the claim, and the re-attach
    applies it and finishes on the claimed device;
  - the re-attach tests in `restore_tests.rs` still pass;
  - `bun run check:push` green.
  Commit: Apply a restore met anywhere in a re-attach
  Depends on: none

- [x] 4. Keep a claim and a space creation until the file records them
  Goal (per question 4):
  - Client migration `V13__sync_enrolling.sql` adds the singleton `sync_enrolling`: the kind (claim or creation),
    nonce, code hash, space id, and server URL.
  - Before a claim or a creation, the engine writes the token under `sync.pending_token.{nonce}`, then the row.
    Every later call for the same code, or any later creation, reuses them until the file records the enrollment.
    A row whose key is gone is dropped, and the call starts over with a new nonce and token.
  - The transaction that records it clears the row: `enroll_device`, `begin_import`, or `switch_device` for a
    re-attach.
    `sync_enrolling` joins `SYNC_TABLES`, so `begin_import` clears it with the rest.
    The token key goes after that transaction.
  - Only `pairing_failed` clears a pending claim without recording it.
    Any other refusal keeps it, and a creation keeps its credentials through every refusal.
    An earlier attempt may have landed with its reply lost, and only the same nonce and token return its device.
    Implementation narrowed this from "any reply but a transport error"; a later `429` or `400` would burn the code.
  - The authoritative reset keeps the row with `sync_state`, so a re-attach that met one still finishes.
  - A join whose code has a pending claim skips the preview, and uses the stored space id and server URL.
    The server answers the preview of a claimed code `pairing_failed`, so a retry could not reach the claim.
  - Code normalization moves to `koloda-sync-proto`, shared with the server's `code_hash`.
  - `PROTOCOL.md` §Pairing, §Bodies, and §Re-attach, and the engine README, state the rules.
  Constraints:
  - `agents/DB.md` for the client migration, including the schema inventory snapshot.
  - The web host creates the table through the shared SQL series and never writes it.
  Done when:
  - an engine test: a claim whose every attempt loses the reply, then `join` again with the same code, ends with
    one device whose token works;
  - the same after a stop between the server's commit and the file's record;
  - an engine test: a re-attach whose old-device lookup fails by transport finishes on the same device on the next
    `join` with the same code;
  - an engine test: a creation whose replies are lost makes one space on the retry;
  - `a_wrong_code_fails_and_leaves_the_file_alone` still holds;
  - `bun run check:push` green.
  Commit: Keep a claim and a space creation until the file records them
  Depends on: 2, 3

- [x] 5. Detach a file whatever its token state
  Goal (per question 6):
  - `detach_locally` marks the file detached, then deletes the token.
    It reads `sync_state` itself, so a missing token does not stop it, and a token already gone is not an error.
  - `detach` detaches locally without a server call when an attached file has no token.
  - `detach` treats `unknown_device` with the file's own epoch as it treats `revoked`.
  - `PROTOCOL.md` §Devices, the engine README, and the Detach note in `agents/RUST.md` state the rules.
  Constraints:
  - A cycle that meets `unknown_device` still only reports it; nothing detaches until the host calls `detach`.
  Done when:
  - engine tests, each ending in a re-attach that works:
    - a secret store that fails the delete still leaves the file detached;
    - an attached file whose token is gone detaches;
    - a file the server answers `unknown_device` detaches;
  - `bun run check:push` green.
  Commit: Detach a file whatever its token state
  Depends on: none

- [x] 6. Relink a card's attachments only when its content head goes
  Goal:
  - In `drop_envelope`, `relink_to_create` runs only when the `heads` delete removed a row.
  - Dropping a superseded version, kept only by a lease, leaves `attachment_refs` and `unlinked_since` alone.
  Done when:
  - a server test: a lease pins content v1, v2 becomes the head, v1 is dropped, and v2's attachments stay linked;
  - a dropped content head still relinks through the create;
  - `bun run check:push` green.
  Commit: Relink a card's attachments only when its content head goes
  Depends on: none

- [x] 7. Recheck an upload's room under the writer lock
  Goal:
  - In `store` in `crates/koloda-server/src/attachments.rs`, after the `is_stored` recheck, `room` runs again on
    the writer transaction.
  - Anything but `Free` answers `507`, deletes the staged file, and inserts nothing.
  - The check before staging stays, so a space already over still costs no write.
  Done when:
  - a server test with a `FreeSpace` fake that reports room on the first check and too little on the second: the
    upload is refused `507`, with no row and no file;
  - an upload of bytes the space already stores still succeeds while the space is over;
  - `bun run check:push` green.
  Commit: Recheck an upload's room under the writer lock
  Depends on: none

- [x] 8. Stop a push once a reply puts skew past the tolerance
  Goal (per question 5):
  - After each push reply, the push loop settles it, then checks skew before it sends the next batch.
    Past the tolerance it returns `ClockSkew`, and the cycle pauses the clock as for any skew stop.
  - The batch whose reply moved the skew stays settled; only the batches not yet sent wait.
  - `PROTOCOL.md` §Skew guards and the engine README state the rule.
  Done when:
  - an engine test: a push of several batches whose second reply moves server time past the tolerance sends no
    third batch, ends with `ClockSkew`, and lands the rest at new stamps once the skew is back inside;
  - `bun run check:push` green.
  Commit: Stop a push once a reply puts skew past the tolerance
  Depends on: none

- [x] 9. Show the metered pause when heal or backfill waits for the allowance
  Goal:
  - When the allowance is spent and heal or backfill still has rows (`sync_state.heal_step`, `backfill_step`),
    `top_up` calls `hold_bulk` and adds nothing.
  - The pause shows by the end of the cycle that spent the allowance, whichever work spent it: a backfill or heal
    batch, a cold page, or an image.
  - Implementation found that a scan is open while a cold page or an image spends the allowance only when the push
    did not run that cycle (a skew pause, a push waiting on server time): a push with room drains heal and backfill
    first.
    The reachable case is a scan that opens after the spend, such as a heal after a restore.
    The tests cover that; in the push-skipped case the pause shows at the next cycle that pushes.
  - `PROTOCOL.md` §Metered networks already says the engine reports the pause; the engine README says how.
  Done when:
  - an engine test: on a metered network, a cold page spends the allowance while a backfill is open, and the status
    shows the pause after that cycle and the next;
  - the same with the last image of a due batch;
  - `backfill_stops_once_the_allowance_is_spent` still passes;
  - `bun run check:push` green.
  Commit: Show the metered pause when heal or backfill waits for the allowance
  Depends on: none

- [ ] 10. Wake the runner when a push wait ends
  Goal:
  - After a cycle that leaves a push waiting on server time, `run_forever` sleeps until the earlier of the poll and
    `push_resumes_at_ms`, inside the interruptible `triggers.wait`, and then runs a cycle.
  - `note_push_wait` fires no trigger, or the cycle that sets the wait would skip the sleep.
  - The engine README states the rule.
  Done when:
  - a runner test with the fake timer: while the socket is up, a push wait 2 minutes out makes the runner sleep 2
    minutes, not 5, and the next cycle pushes;
  - `bun run check:push` green.
  Commit: Wake the runner when a push wait ends
  Depends on: none

## Outcome

