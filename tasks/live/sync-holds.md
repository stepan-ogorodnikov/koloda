# Sync holds and quotas

Status: ready

## Intent

Let sync stop safely and visibly at what it cannot take, and resume on its own once the cause clears.
Today one envelope a device cannot decode fails every pull page that holds it.
The device reports only a generic error, `cold` stops behind a bad `hot` entry and `hot` behind a bad `cold` one,
and a corrupt delete or reset blocks its lane though its header says all that apply needs.
An operator cannot remove a damaged envelope, a space can grow until the disk is full, and a write the server held
stays in `sync_held` forever.
`crates/koloda-sync-proto/PROTOCOL.md` §Push outcomes, §Quotas, §Corrupt envelopes, and §Schema versions describe the
rules; this task builds them.

Done when:

- a device that meets an envelope it cannot read applies a delete or reset from its header, and otherwise holds that
  lane at that seq, keeps pushing, and reports the lane and seq, or that it needs an app update;
- a `cold` hold leaves `hot` running, and a `hot` hold stops `cold`;
- `koloda-server drop-envelope` removes one envelope from a space's log, holding devices pass it, and a dropped create
  ends deleted on every device;
- a space over its quota, or a server low on disk, holds growing writes as `held { quota }`, still admits tombstones,
  and refuses bootstraps and image uploads with `507`;
- once the space has room again, devices push their held writes with their original stamps, without user action;
- an operator can raise a kind's `write_schema` once every active device can write it (question 14);
- `bun run check:push` is green and runs the new tests.

## Scope

In:

- `koloda-sync-proto`: `held { quota }`, `507 insufficient_storage`, the quota flag in device meta, the reserved
  server sender, and the advertised-schemas header (question 14).
- `koloda`: apply that stops a page at an unreadable entry and applies corrupt deletes and resets from the header;
  regeneration of held writes.
- `koloda-sync`: lane holds and their status, a bootstrap that meets an unreadable entry, the regeneration trigger,
  and the advertised schemas.
- `koloda-server`:
  - `drop-envelope` and the server-authored tombstone;
  - space quotas, disk watermarks, and the `quota` command;
  - the `write-schema` command (question 14).
- `PROTOCOL.md`, the READMEs, and `agents/RUST.md`, each with the item that makes them true.

Out:

- Chunked deletes, and the conformance case for running out of disk during a 20M-review deck delete.
  Deletes cascade in one transaction (`PROTOCOL.md` §Deletes).
- A schema-2 payload, and re-encoding a `held { schema }` write at a newer schema: no app version writes one yet.
- The events WebSocket, built-in TLS, Docker, metered-network pauses, and the client's free-disk preflight (the
  transport task).
- The recovery follow-up about a `fixed` cohort stamped more than 5 minutes ahead.
- NAPI `cmd_sync_*`, Settings → Sync, the join wizard, and a product spec for sync (the desktop UI task, which lands
  last).
- The web host, which does not sync, and mobile.

## Open questions

The owner took every recommendation on 2026-10-08.

- [x] 1. Area guides?
  Answer: `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`,
  `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md`, `agents/TESTING.md`, `agents/RUST.md`, `agents/DB.md`,
  and `agents/REVIEW.md` for self-review.
  Also `crates/koloda/README.md`, `crates/koloda-sync/README.md`, `crates/koloda-server/README.md`,
  `crates/koloda-sync-proto/PROTOCOL.md` and its README, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`.
- [x] 2. One task, or two?
  Answer (owner, 2026-10-08): one task, in this order: pull holds, `drop-envelope`, quotas, regeneration, then the
  `write_schema` raise.
  Pull holds come first because they are the largest gap users can see, and they need no server change.
- [x] 3. Which envelopes are unreadable, and which need an app update?
  The server checks every header on push, so a header that does not decode here means storage damage, or a server
  newer than this app.
  Answer:
  - `update_required`: the header names a kind, group, or op this app's registry lacks (`RegistryError`), or a
    schema above this app's `SCHEMA` for its kind (`PayloadError::UnknownSchema`).
    A delete at an unknown schema holds too: an app that does not know a schema decodes nothing.
  - `corrupt_envelope`: anything else that fails `Envelope::decode`, `check_lane`, or `Payload::decode`.
    That includes a header with a field this app does not know, which `deny_unknown_fields` refuses.
  - A delete whose header decodes and whose payload does not applies with no `successor`.
  - A `cards.reset` whose header decodes and whose payload does not applies with `wall_ms` from its HLC wall part.
- [x] 4. Where does a pull hold live?
  Answer: in memory only, as the cycle's result; no column in `sync_state`.
  - Apply commits the entries before the unreadable one and sets the lane cursor to its seq minus one.
    `PageEntry` gains the `seq` that `LogEntry` already carries.
  - Every later cycle pulls from that cursor and meets the entry again.
    It passes once an upgraded app reads it or a drop removed it, so the hold needs no release step and no migration.
  - The status shows the hold from the last cycle; after a relaunch the first cycle finds it again.
  The alternative is a stored hold, which shows before the first cycle but needs a release rule for both causes.
- [x] 5. How does a hold show in `sync_status()`?
  Answer: `Status` gains `hold: Option<Hold>`, where `Hold` has `lane`, `seq`, and a reason of
  `corrupt_envelope` or `update_required`.
  The state stays `Idle` or `Syncing`, because pushing and the other lane go on; the host shows the hold beside it.
  The alternative is a new `Stop`, which reads as "sync stopped" while pushes still go out.
- [x] 6. What does a bootstrap do when it meets an unreadable entry?
  A snapshot has no lane cursor to hold at, and `cold` streams newest first.
  Answer: the bootstrap stops, releases its lease, and reports the hold with the entry's lane and seq.
  The next trigger opens a new lease; union apply makes the repeat safe.
  A join or re-bootstrap therefore waits for the upgrade or the drop.
- [x] 7. Which seq does `drop-envelope` name?
  Seqs are per lane, so `PROTOCOL.md`'s `drop-envelope <space> <seq>` is ambiguous.
  Answer: `koloda-server drop-envelope --data-dir <dir> <space> <lane> <seq>`, matching the lane and seq the
  hold reports.
  It runs beside `serve`, as `spaces` and `pair` do, through SQLite's own locking.
- [x] 8. What does a drop do to each kind of entry?
  Answer:
  - an update or a review: removes the version, the head that references it, and any lease items for it.
    Devices keep what they had.
  - a create: tombstones the entity with a server-authored delete (question 9) through the same path a pushed delete
    takes (`log::delete`), so the server removes and fences it and its descendants and appends the tombstone.
  - a tombstone: removes it and appends a server-authored tombstone of the same entity, so holding devices still
    apply the delete.
  - The command prints the entry's lane, seq, kind, id, and group, and for a create how many cards and reviews go
    with it.
    It asks before it writes, unless `--yes`.
  - It is one space write transaction; nothing changes if the seq holds no version or the operator declines.
- [x] 9. Who authors the server's tombstone?
  `PROTOCOL.md` gives it the nil UUID as `stamp_device`, an HLC above both the dropped envelope's and server now, and
  a reserved server sender "which no restore roster contains".
  Answer:
  - the sender is the nil UUID too, since a device id is never nil; `koloda-sync-proto` names it `SERVER_SENDER`;
  - its seqs come from a `senders` row like a device's, so a restore's cutoff covers the server tombstones the
    backup holds, and heal re-pushes only those it lacks;
  - that replaces "which no restore roster contains" in `PROTOCOL.md` §Corrupt envelopes;
  - the payload is `Delete` with no `successor`, sealed at the kind's write schema, with a random commit id;
  - devices apply it as any tombstone, and heal re-pushes it under the device's own seq, as for any foreign write.
  The alternative keeps the server out of the roster.
  Every device would then re-push every server tombstone after any restore; that is harmless (`stale`) but wasteful.
- [x] 10. What does a quota measure, and where is it set?
  Answer:
  - usage is the space database's pages in use (`page_count - freelist_count`, times `page_size`) plus the sizes in
    its `attachments` table;
  - both are cheap to read, and a freeing delete lowers the first once its transaction commits;
  - each space's quota is a nullable `spaces.quota_bytes` in `server.db`; null means none, and new spaces get none;
  - `koloda-server quota --data-dir <dir> <space> <bytes|none>` sets it beside `serve`.
  The alternative is one server-wide `serve` flag, which is simpler but gives every space in a household one size.
- [x] 11. Are disk watermarks in this task, and how is free space read?
  Answer: yes, as two `serve` flags.
  - `--min-free-disk` (default 1 GiB): below it, growing writes are held as if the space were over quota.
  - `--reserve-disk` (default 64 MiB): below it, every push, tombstones included, is refused with `507` before
    anything is consumed or fenced.
  - Free space comes from `rustix::fs::statvfs` on the generation directory (`rustix` is already in `Cargo.lock`),
    behind a trait the tests set.
    It is Unix only; on other targets the watermarks are off.
  The alternative is `fs4`, a new dependency that also covers Windows.
- [x] 12. How does a device learn that `held { quota }` has cleared?
  Answer: `DeviceMeta` gains `is_over_quota`, which every device call returns, the soft disk watermark included.
  - A reply showing `false` while the file has `quota` rows in `sync_held` starts regeneration (question 13).
  - `Status` shows the flag from the last reply, so the host can say the server is full.
  The alternative is retrying held rows on a backoff, which consumes seqs while the space stays full.
- [x] 13. What does regeneration send, and in what order?
  Answer:
  - every `quota` row and every `dependency` row of `sync_held` moves back to the outbox tail in its original seq
    order, at new seqs, with each commit id's rows together;
  - bytes, stamps, and commit ids are unchanged, since no schema changes; each commit id is a `fixed` cohort marked
    consumed;
  - the register, origin, or tombstone the write lives in takes the new seq, as heal does;
  - a held update whose register has since moved to another stamp is dropped instead, since it would come back
    `stale`;
  - a row that comes back `held` again returns to `sync_held`;
  - `schema` rows stay: this app writes only schema 1 and cannot regenerate them at a newer one (Scope, Out).
  Original seq order is already topological, because capture enqueues referents and parents first.
- [x] 14. Should this task raise `write_schema` at all?
  Every kind is at schema 1 and no app writes 2, so a raise has no client to serve yet.
  Answer: build the server half now, so the first schema bump only adds payloads.
  - Every device call carries `koloda-schemas`: the highest schema this app writes, per kind.
    A device call without it is `bad_request`, as for `koloda-epoch`; the server stores it on the device record.
  - `koloda-server write-schema --data-dir <dir> <space> <kind> <schema>` raises a kind by one version.
    It refuses while an active device (neither stale nor revoked) of the space has not advertised that version.
  - Lowering is refused.
  The alternative is leaving the raise to the first schema-2 change, and dropping item 6.
- [x] 15. Fold in the `data_dir::init` follow-up?
  The restore task noted that `data_dir::init` writes `CURRENT` with its own code instead of `swap_current`.
  Answer: yes, as item 7; it is a one-function change in a crate this task already changes.
  The alternative is a separate change outside the task.
- [x] 16. Migrations?
  Answer: `server.db` gains `V3__quotas.sql`, for `spaces.quota_bytes` and the device's advertised schemas.
  - The space series needs none; the server sender's seqs use `senders`.
  - `koloda` needs none: holds live in memory, and `sync_held.reason` is text, so `quota` fits.
  - Items extend `V3` until the task lands, as earlier tasks did.

## Plan

- [x] 1. Stop a pull page at an envelope this app cannot read
  Goal:
  - `PageEntry` gains `seq`; the engine fills it from `LogEntry.seq`.
  - `apply_page` and `apply_snapshot_page` decode entry by entry and sort each by question 3:
    - a readable entry applies by the apply rule, as today;
    - a delete or `cards.reset` whose header decodes and whose payload does not applies from the header;
    - anything else stops the page there.
  - `apply_page` returns the changed kinds and an optional `Hold { lane, seq, reason }`.
    On a hold it commits the entries before it and sets the lane cursor to the held seq minus one, never past it.
  - `apply_snapshot_page` returns the same hold and moves no cursor.
  - `PROTOCOL.md` §Corrupt envelopes and `crates/koloda/README.md` say so.
  Constraints:
  - the decision reads only the header and the decode error; no payload value is guessed beyond the two header rules;
  - no SQL outside `koloda`.
  Done when: tests in `crates/koloda/tests/integration/` cover:
  - a corrupt card create, update, and review mid-page: the entries before it applied, the cursor at its seq minus
    one, and nothing after it applied;
  - a corrupt algorithm delete repairing its pointers as for no `successor`, and a corrupt reset writing blank
    scheduling and `reviews_reset_at` from the HLC wall part;
  - an unknown kind, group, and schema reported as `update_required`, a delete at an unknown schema included;
  - a header that does not decode reported as `corrupt_envelope`;
  - a snapshot page with each of the above;
  - `bun run check:push` green.
  Commit: Stop a pull page at an envelope this app cannot read
  Depends on: none

- [x] 2. Hold a lane at an envelope this app cannot read
  Goal:
  - The cycle takes the hold that `apply_page` returns (question 4).
    A `hot` hold skips `cold` for the round; a `cold` hold leaves `hot` running.
    A held lane counts as at head for the round's catch-up test, so the cycle does not spin through its rounds.
  - Dangling-default repair waits while `hot` is held.
  - Pushing continues in every case.
  - `Status` gains `hold` (question 5), kept in `RunState` from the last cycle; a cycle that passes the seq clears it.
  - A bootstrap that meets a hold stops as question 6 says.
  - `PROTOCOL.md` §Corrupt envelopes and §Cycle, and `crates/koloda-sync/README.md`, say so.
  Constraints: no new local table; every cycle finds the hold again.
  Done when: tests in `crates/koloda-sync/tests/engine/` cover, with bytes damaged in the server's space database:
  - a corrupt card create holding both lanes, while the device's own edits still push;
  - a corrupt review holding `cold` only, while another device's `hot` writes still arrive;
  - a corrupt delete and a corrupt reset applied, with the cursor past them;
  - an unknown kind reported as `update_required`;
  - the damaged bytes put back, standing in for an app upgrade: the next cycle passes the seq and clears the hold;
  - a join bootstrap meeting a corrupt entry: stopped, its lease released, the hold reported, and finished once the
    bytes are put back;
  - `bun run check:push` green.
  Commit: Hold a lane at an envelope this app cannot read
  Depends on: 1

- [x] 3. Drop an envelope from a space's log
  Goal:
  - `koloda-sync-proto` gains `SERVER_SENDER`, the nil UUID (question 9).
  - `koloda_server::drop::prepare(data_dir, space, lane, seq, now_ms)` reads the version at that seq and describes
    it; `Prepared::commit()` drops it as question 8 says.
  - The server-authored tombstone takes the next seq of the server sender's `senders` row, and an HLC above both the
    dropped envelope's and server now.
  - `koloda-server drop-envelope --data-dir <dir> <space> <lane> <seq> [--yes]` prints the description and asks
    before it commits, unless `--yes`; it runs beside `serve` (question 7).
  - `PROTOCOL.md` §Corrupt envelopes and §Server restore, and the server README, say so.
  Constraints:
  - the tombstone goes through the path pushed deletes take (`log::delete`);
  - nothing changes when the seq holds no version or the operator declines.
  Done when: tests in `crates/koloda-server/tests/server/` cover:
  - a dropped update: version and head gone, a pull from below passes it, and a fresh bootstrap shows the group as of
    the create;
  - a dropped review;
  - a dropped create: the entity and its descendants removed and fenced, and a tombstone at a new seq with the nil
    stamp device, the server sender, and an HLC above both;
  - a dropped tombstone replaced by a server-authored one;
  - a seq a lease pins leaving that lease's stream;
  - a later push of an update to a dropped create's entity coming back `fenced`;
  - a seq with no version refused, with nothing changed;
  and in `crates/koloda-sync/tests/engine/`:
  - a corrupt create, update, and review held, then dropped: every device passes the seq, and the dropped create
    ends as a tombstone on every device, the one that held it included;
  - a heal restore from a backup taken before the drop: a device re-pushes the server tombstone, and the entity stays
    deleted;
  - `bun run check:push` green.
  Commit: Drop an envelope from a space's log
  Depends on: 2

- [x] 4. Hold growing writes above a space quota
  Goal:
  - `koloda-sync-proto` gains `HeldReason::Quota`, `ErrorCode::InsufficientStorage` (`507`), and
    `DeviceMeta.is_over_quota` (question 12).
  - `server.db` migration `V3__quotas.sql` adds `spaces.quota_bytes` (question 10).
  - `koloda-server quota --data-dir <dir> <space> <bytes|none>` sets or clears it beside `serve`.
  - `serve` gains `--min-free-disk` and `--reserve-disk` (question 11); free space is read through a trait that the
    tests set.
  - Push:
    - over the quota or below `--min-free-disk`, every envelope but a delete is `held { quota }`;
    - below `--reserve-disk`, the push is refused with `507` and consumes nothing.
  - While a space is over, `POST .../bootstrap` and attachment `PUT` answer `507`.
  - Every device call's meta carries `is_over_quota`.
  - `PROTOCOL.md` §Quotas, §Push outcomes, §Errors, and §Bodies, and the server README, say so.
  Constraints: usage is read once per push, under the writer lock; a push may overshoot the quota by one batch.
  Done when: tests in `crates/koloda-server/tests/server/` cover:
  - a space over quota: a create and an update `held { quota }`, and a delete applied;
  - a freeing delete bringing the space back under quota, and the next create applied;
  - below the reserve: the push refused with `507`, nothing consumed, and a retry once space returns consuming it;
  - a bootstrap and an attachment upload answered `507` while over, and served once under;
  - `is_over_quota` in meta, the soft watermark included;
  - the `quota` command setting and clearing a quota, and a space with none never over;
  - `bun run check:push` green.
  Commit: Hold growing writes above a space quota
  Depends on: none

- [x] 5. Push held writes once the space has room
  Goal:
  - `outbox.rs` stores `held { quota }` with reason `quota`.
  - `koloda` gains `release_held(db) -> usize`, which moves rows back to the outbox as question 13 says.
  - The engine runs it before a round's push when the round's device record shows `is_over_quota == false` and the
    file has `quota` rows (question 12).
  - `Status` gains `is_over_quota` from the last reply.
  - An attachment upload answered `507` stays queued and backs off, as for other failed uploads.
  - `PROTOCOL.md` §Push outcomes ("This app version regenerates nothing" goes) and §Quotas, and both READMEs, say
    so.
  Constraints:
  - stamps and commit ids never change, and no commit id is split;
  - no SQL outside `koloda`.
  Done when: tests in `crates/koloda/tests/integration/` cover:
  - rows moved in seq order at new seqs, with bytes and stamps unchanged and each commit id one `fixed` cohort;
  - registers, origins, and tombstones naming the new seqs;
  - a held update whose register has moved on dropped, and `schema` rows left in place;
  and in `crates/koloda-sync/tests/engine/`:
  - a space over quota: a deck create and its cards held; a freeing delete pushed; the space back under quota; the
    held writes pushed on the next cycle, and another device seeing the deck and cards at their original stamps;
  - a held seq followed by a writable kind;
  - a relaunch between release and push losing nothing;
  - `bun run check:push` green.
  Commit: Push held writes once the space has room
  Depends on: 4

- [x] 6. Raise a kind's write schema
  Goal:
  - `koloda-sync-proto` gains `SCHEMAS_HEADER` (`koloda-schemas`) and its encoding (question 14).
  - The engine sends, on every device call, this app's `SCHEMA` for every registry kind.
  - `V3__quotas.sql` adds the advertised schemas to `devices`; `require_device` refuses a call without the header
    and stores the value when it changes.
  - `koloda-server write-schema --data-dir <dir> <space> <kind> <schema>` raises a kind by one version, refusing
    while an active device has not advertised it; lowering is refused.
  - `PROTOCOL.md` §Schema versions and §Endpoints, and the server and engine READMEs, say so.
  Constraints: the command runs beside `serve` and shares code with the HTTP handlers.
  Done when: tests in `crates/koloda-server/tests/server/` cover:
  - a raise refused while one device advertises schema 1, and accepted once every active device advertises 2;
  - a revoked or stale device not counted, and a lowering refused;
  - a v2 write before the raise answered `schema_read_only`, and a v1 write after it `held { schema }`;
  - a device call without the header refused;
  - `bun run check:push` green.
  Commit: Raise a kind's write schema once every device can write it
  Depends on: 4

- [x] 7. Write the first CURRENT through swap_current
  Goal: `data_dir::init` writes `CURRENT` with `swap_current` instead of its own code (question 15).
  Constraints: no change to the data directory layout.
  Done when: the `init` and `restore` tests pass unchanged; `bun run check:push` green.
  Commit: Write the first CURRENT through swap_current
  Depends on: none

## Outcome

<what shipped>
