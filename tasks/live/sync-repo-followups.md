# Sync modules audit follow-ups

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda/src/repo/sync/README.md, crates/koloda-sync-proto/PROTOCOL.md, agents/RUST.md, crates/koloda-sync/README.md, agents/DB.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/TESTING.md, agents/CODE-DOCUMENTATION.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

Fix the four findings the `sync-repo-audit` task left as Later.
They come from the audit of the sync modules in `koloda` (`crates/koloda/src/repo/sync`) at `6fb22a74` (`main`).
Its report was `tmp/audits/sync-repo.md`, which git ignores.
`tasks/archive/sync-repo-audit.md` kept their evidence; this file restates it, so neither needs to be open.
Each finding was checked again against `dcb11771` when this task was scheduled, and each still holds.

Done when:

- a space over quota holds at most the writes the outbox already had and the ones made meanwhile, not the whole
  backfill, so a release reads a bounded backlog (question 2);
- deleting any number of selected cards pushes in cohorts the server accepts, and no capture can write a cohort it
  refuses (question 3);
- a learning value this app refuses holds the lane as corrupt, and the learning settings screen and today's review
  totals still read;
- picking the next due image transfers reads a bounded number of queue rows through an index;
- `PROTOCOL.md` describes each new rule, with the item that makes it true;
- `bun run check:push` is green.

## Scope

Findings, numbered as in the report.
Line numbers are at `dcb11771`.

- 4. Risk, Later: a quota release moves the whole held backlog into memory and the outbox at once.
  Decision: fix by item 2 (question 2).
  - While a space is over quota, every pushed write but a delete moves to `sync_held` (`outbox.rs:217-230`).
  - The engine keeps topping up from heal and backfill and pushing (`crates/koloda-sync/src/push.rs:32-66`).
    It reads the quota state only from the round's device record (`crates/koloda-sync/src/cycle.rs:249`), and
    `top_up` never reads it.
    So a server below its 1 GiB free-disk watermark during a backfill fills `sync_held` with the whole database.
  - Once a record shows room (`cycle.rs:105-111`), `release_held` reads every `quota` and `dependency` row, envelopes
    included, into one `Vec`, and inserts them all into the outbox in one transaction (`outbox.rs:316-397`).
    `PROTOCOL.md` §Push outcomes asks for that.
  - The outbox then holds the whole database, against §Backfill and the top-up invariant (`push.rs:27-28`).
    Each push batch groups the whole outbox (`outbox.rs:87-110`), about n²/2000 row reads for the drain.
  - The same backlog is what made the re-bootstrap's cleanup slow; `V17` indexed that read.
- 5. Risk, Later: a cohort above the server's push cap blocks the outbox for good.
  Decision: fix by item 1 (question 3).
  - `push_batch` sends a cohort past either cap alone (`outbox.rs:100-102`).
    The server refuses more than `MAX_PUSH_ITEMS` (5,000) envelopes (`crates/koloda-sync-proto/src/transport.rs:48`;
    `crates/koloda-server/src/push.rs:230-233`).
    `push_refused` returns the cohort to `local` (`outbox.rs:540-552`), and the next push picks it first again.
  - Only `delete_cards` writes such a cohort today: one tombstone per card, in one capture (`cards.rs:335-361`).
    The cards table keeps its selection across pages (`libs/srs-react/src/lib/cards/cards-table.tsx:46`, `:155`), so
    a user can select more than 5,000 cards.
  - The body cap is the other limit: `MAX_BODY_BYTES` is 16 MiB, and one envelope may carry up to 512 KiB of
    payload (`crates/koloda-sync-proto/src/envelope.rs:12`).
- 6. Risk, Later: learning values are not versioned, and one this app refuses breaks every read.
  Decision: fix by item 3.
  - Apply holds a learning value only when it is not JSON (`apply.rs:217-225`; `PROTOCOL.md` §Corrupt envelopes).
    A JSON value this app's validator refuses goes into the document (`apply.rs:709-713`, `patch_learning` at
    `apply.rs:751-785`).
  - Every read normalizes and validates the document (`settings.rs:63`; `domain/settings.rs:76-80`).
    So the learning settings screen and today's review totals (`reviews.rs:164-170`) fail until another write
    replaces the key.
  - Checked when scheduling: decode never checks that the default algorithm and template ids are UUIDs
    (`crates/koloda-sync-proto/src/payload.rs:148-150`), and every read does (`domain/settings_learning.rs:48-59`).
    A remote id that is not one breaks reads the same way.
  - The value is JSON text under a fixed payload key.
    So a newer app can change its shape without the schema bump `PROTOCOL.md` §Schema versions requires.
  - `set_settings` compares the stored document with the normalized new one (`settings.rs:90-120`).
    A key the stored document lacks a defaulted field of is then re-sent on every save, though the user did not change
    it.
- 7. Risk, Later: `due_transfers` reads the whole due queue for every 16 transfers.
  Decision: fix by item 4.
  - It collects every due row, sorted, then stops at `limit` (`attachments.rs:86-120`).
    The queue has no index on `next_attempt_at` (`V10__sync_attachments.sql`).
  - The engine asks for 16 at a time (`crates/koloda-sync/src/attachments.rs:22`, `:90`), so n due transfers cost
    about n²/16 row reads.
  - Download time dominates until backlogs of about 100k images.

In:

- `koloda`: `delete_cards` and `Capture`, apply's learning check, `set_settings`, `due_transfers`, client migration
  `V18`, and `index_tests.rs`.
- `koloda-sync`: `top_up` and the push loop's quota note.
- `crates/koloda-sync-proto/PROTOCOL.md`: §Cohorts, §Quotas, §Backfill, §Corrupt envelopes, §Schema versions, each
  with the item that makes it true; crate READMEs where they describe the same.
- `@koloda/db-sqlite`: rebuilt and tested against `V18`; no TS change.

Out:

- How `release_held` moves rows: it stays one transaction, as §Push outcomes says (question 2).
- The cards table and its selection; the web host's TS delete, which captures nothing.
- The server's caps.

## Open questions

- [x] 1. Flow? — `local` (human, 2026-10-16).
- [x] 2. How are held writes bounded (finding 4)? — no top-ups while over quota (human, 2026-10-16).
  The engine adds no heal or backfill batch while the space is over quota (item 2).
  A hold then holds at most the one push batch the outbox had and the writes made meanwhile.
  `release_held` and §Push outcomes stay as they are.
  Not chosen: releasing one push batch at a time.
  `sync_held` would still fill with the whole database.
  And pending writes would wait behind a release spread over rounds.
- [x] 3. Where does a bulk card delete split into cohorts (finding 5)? — one transaction, a new cohort every 1,000
  cards (human, 2026-10-16).
  The delete stays atomic on the device; another device may show part of it until its next pull.
  §Cohorts then says a commit may write several cohorts, as backfill already does across phases (`backfill.rs:234`).
  `Capture` refuses a cohort the server would refuse.
  Not chosen: one transaction per 1,000 cards, where a failure part way leaves part of the selection deleted.

## Plan

- [x] 1. Split a bulk card delete into cohorts the server accepts
  Goal (finding 5; per question 3, answer A):
  - `delete_cards` (`cards.rs:335-361`) keeps one transaction.
    It opens a new `Capture` every 1,000 cards, so each chunk is its own cohort with its own stamp and `commit_id`.
    The constant's WHY: a push never splits a cohort, the server takes at most `MAX_PUSH_ITEMS` envelopes, and 1,000
    also fits the engine's 2,000-envelope batch.
  - `Capture` refuses a write that would take its cohort past `MAX_PUSH_ITEMS` envelopes, or past `MAX_BODY_BYTES`
    with each item's push framing counted.
    The write fails, and the transaction with it.
    Its INVARIANT: a cohort the server refuses would block the outbox for good, since the next push picks it first.
    No product path reaches the refusal today.
  - `PROTOCOL.md` §Cohorts: a cohort is one capture's envelopes, and a commit may write several.
    A bulk delete writes one per 1,000 cards, and no cohort passes one push's caps.
    `crates/koloda/src/repo/sync/README.md`, §Sync capture: a write path that may pass the cap opens a new capture
    per chunk.
  Constraints:
  - `koloda` only; no engine or server change.
  - The TS delete path and the cards table stay as they are.
  Done when:
  - An integration test deletes 2,500 cards on an enrolled database.
    It finds three cohorts of 1,000, 1,000, and 500 tombstones, each with its own stamp, and no card or review left.
  - A capture test: a write past the item cap fails, and its transaction leaves nothing behind.
  - `cargo test -p koloda` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — it needs thousands of cards on a synced desktop; the test counts the cohorts.
  Commit: Split a bulk card delete into cohorts the server accepts
  Depends on: none

- [x] 2. Stop topping up the outbox while the space is over quota
  Goal (finding 4; per question 2, answer A):
  - `top_up` (`crates/koloda-sync/src/push.rs:32-66`) adds no heal or backfill batch while the space is over quota.
    The quota state is the latest device meta: the round's record, or a push reply's `meta.device`.
  - The push loop notes each reply's `is_over_quota` (`note_quota`, `engine.rs:469`), so a push that starts holding
    stops the top-ups in the same round.
  - Its INVARIANT: while over, every write but a delete comes back held, so a top-up would only move the database
    into `sync_held`.
  - `PROTOCOL.md` §Quotas, the list of what happens while a space is over: a device adds no backfill or heal batch.
    A hold then holds at most one push batch of them and the writes made meanwhile.
    §Backfill: the bound that the outbox never holds the whole database covers held writes too.
  - `crates/koloda-sync/README.md` where it describes the top-up (line 62).
  - `index_tests.rs`'s module doc says a quota hold can fill the held writes with the whole backfill; it says what it
    can hold now.
    `V17`'s comment stays, since an applied migration is never edited.
  Constraints:
  - `release_held` and §Push outcomes stay as they are.
  - No new status: the run state already reports `is_over_quota`.
  Done when:
  - An engine test (`tests/engine/holds_tests.rs`): a space over quota with backfill left takes one push of what the
    outbox held and gets no backfill batch.
    Once a record shows room, the release goes out and the backfill resumes.
  - The same test fails against today's `push.rs`, checked once by hand.
  - `cargo test -p koloda-sync` passes, and `bun run check:push` is green.
  Manual verify: none — it needs a server over quota during a backfill, which only the engine tests arrange.
  Commit: Stop topping up the outbox while the space is over quota
  Depends on: none

- [ ] 3. Hold a learning value this app refuses as corrupt
  Goal (finding 6):
  - `breaks_domain_rule` (`apply.rs:217-225`) checks each learning group as a read checks it.
    - `dailyLimits` parses as `DailyLimits` and passes its `validate`.
    - `learnAheadLimit` parses as `LearnAheadLimit` and passes its `validate`.
    - `dayStartsAt` is a string `parse_day_starts_at` accepts.
    - The default algorithm and template ids pass the UUID check `LearningDefaults::validate` makes.
    - A group that fails holds the lane as corrupt (§Corrupt envelopes) and never reaches the document.
  - `domain/settings_learning.rs` exposes those per-key checks, so apply and `validate` share them.
  - `set_settings` (`settings.rs:90-120`) normalizes the stored document before it compares, so a save captures only
    the keys whose normalized value changed.
    A stored document that does not normalize still counts as absent, so every key is captured.
  - `PROTOCOL.md` §Corrupt envelopes: a learning value or default id this app's validation refuses is corrupt.
    §Schema versions: a learning value's JSON shape is part of its payload shape, so changing it bumps
    `settings.learning`'s schema.
  Constraints:
  - `koloda` and `PROTOCOL.md` only.
  - The learning settings rules themselves do not change.
  Done when:
  - Apply tests: a `dailyLimits` value that is JSON but fails validation, and a default algorithm id that is not a
    UUID, each hold the lane as `corrupt_envelope`.
    The learning document and today's review totals still read.
  - A settings test: with a stored document that lacks a defaulted field of one key, saving another key captures
    only that key.
  - `cargo test -p koloda` passes, and `bun run check:push` is green.
  Manual verify: none — a peer must send a value this app refuses, which only the tests arrange.
  Commit: Hold a learning value this app refuses as corrupt
  Depends on: none

- [ ] 4. Page due image transfers through an index
  Goal (finding 7):
  - Client migration `crates/koloda/src/migrations/V18__sync_attachment_queue_due.sql` adds
    `sync_attachment_queue_due_idx` on `sync_attachment_queue (next_attempt_at, direction, id)`.
    Its WHY: the engine asks for 16 due transfers at a time, and a scan per call is quadratic in the backlog.
  - `due_transfers` (`attachments.rs:86-120`) reads a page of due rows with `LIMIT`, in the same order.
    It reads on after the last row's `(next_attempt_at, direction, id)` until it has `limit` transfers or no due row
    is left.
    A fetch it drops as no longer wanted makes it read on.
  - Its statement becomes a `pub(super) const`, and `index_tests.rs` lists it; the module doc names the due read.
  Constraints:
  - `agents/DB.md`: a new file, never an edit of an applied one; touch `migrations/mod.rs`.
    Regenerate `schema-inventory.json` with
    `cargo test -p koloda --test integration write_schema_inventory_snapshot -- --ignored`.
    Rebuild `@koloda/db-sqlite` (or `nx reset`) so its bundle embeds `V18`.
  - If another task lands a migration first, take the next free number.
  - The web stack never writes `sync_attachment_queue`, so no TS change.
  Done when:
  - The index test passes, and fails with `V18` removed, checked once by hand.
  - An attachments test: with more unwanted fetches due than one page, ahead of a due upload, `due_transfers` still
    returns the upload and drops the fetches.
  - `cargo test -p koloda` and `bunx nx test @koloda/db-sqlite` pass, and `bun run check:push` is green.
  Manual verify: none — a query plan and a paged read; nothing a user sees changes.
  Commit: Page due image transfers through an index
  Depends on: none

## Outcome

<what shipped>
