# Sync modules audit fixes

Status: done
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda/src/repo/sync/README.md, crates/koloda-sync-proto/PROTOCOL.md, agents/RUST.md, agents/DB.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/TESTING.md, agents/CODE-DOCUMENTATION.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the audit of the sync modules in `koloda` (`crates/koloda/src/repo/sync`) at `6fb22a74`
(`main`).
Its report was `tmp/audits/sync-repo.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.
The audit ran `cargo test -p koloda`: 1 unit, 395 domain (1 ignored), and 296 integration (1 ignored) passed.
It also read query plans on a scratch database migrated from `V1` to `V16`.
Its verdict: the module follows `PROTOCOL.md` closely, every product write path captures, cohorts stay whole on every
path, and the tests are strong.
The two Should-fix findings sit where a join meets a local edit and where a quota hold meets a re-bootstrap.

Done when:

- a device that joined a space ends with the space's starter algorithm and template, except for the parts it edited
  later than the space did, even when it edited them before the space's download reached them;
- a re-bootstrap after a long quota hold checks each held create through an index, not a scan of every held write;
- `PROTOCOL.md` §Client state and the module docs describe the columns and behavior the code has;
- `bun run check:push` is green.

## Scope

Findings, numbered as in the report.
Line numbers are at `6fb22a74`.

- 1. Spec violation, Later: the client-state table and two doc lines disagree with the code.
  Decision: fixed by item 3.
  - `PROTOCOL.md:1798` (§Client state) says `sync_state` holds "skew".
    No migration adds such a column; the engine keeps the estimate in memory
    (`crates/koloda-sync/src/engine.rs:54`).
  - The same row leaves out `server_url` (`V9__sync_engine.sql:3`) and the bootstrap flag `is_bootstrapping`
    (`V9__sync_engine.sql:27`).
  - `crates/koloda/src/repo/sync/mod.rs:239` says of `SyncState.epoch` that "a re-attach refuses a space restored
    since".
    A re-attach applies the restore and repeats its call (`PROTOCOL.md:1584-1587`, §Re-attach;
    `crates/koloda-sync/src/pairing.rs:226-242`).
  - The module map in `mod.rs:1-7` names every module but `repair`; `README.md:4` says that map is the module map.
- 2. Risk, Should-fix: editing a kept starter row before the space's copy applies makes it diverge for good.
  Decision: fixed by item 1.
  - Add keeps an unmodified starter algorithm at its seed id while the space holds it live (`join.rs:253-271`), and
    the starter template too when no local card uses it (`join.rs:273-292`).
    A space holds the starter algorithm unless someone deleted it, since its creator backfills its seed rows.
  - The joiner never backfills that row (`backfill.rs:579-585`), but a local edit writes a register for the group it
    changes (`capture.rs:120-123`).
  - Apply overlays a seed row only while it has no register and no origin (`apply.rs:416-436`).
    Otherwise the space's create is dropped as a duplicate (`apply.rs:379-381`).
    Its values for every group the user did not edit then never reach the device; the edited groups do converge.
  - After a join from Settings the download runs in the background (`docs/specs/SYNC.md:107`).
    It waits on a metered network above the limit, short of disk space, or on `429`, while the file stays active
    and editable (`PROTOCOL.md:1330-1331`, §Metered networks; §Bootstrap).
  - Example: the user renames the starter algorithm while the download waits.
    The space's create, with the creator's tuned parameters, is dropped.
    The device keeps first-run parameters for that algorithm while every other device uses the creator's.
  - The spec promises the space's copy takes the starter's place (`SYNC.md:99-100`; `PROTOCOL.md:226-228`, §Seed
    identity; `PROTOCOL.md:290-291`, §Classes).
  - The test pins the drop (`tests/integration/sync_apply_integration_tests.rs:148-188`, the touched case).
- 3. Risk, Should-fix: the re-bootstrap's absence cleanup scans `sync_held` once per create.
  Decision: fixed by item 2.
  - `absent_batch` (`rebase.rs:87-111`) keeps a create still held through a `NOT EXISTS` on `sync_held` by kind, id,
    and group (`rebase.rs:97-99`).
    `sync_held` has only its `sender_seq` key (`V9__sync_engine.sql:9-17`), and the plan reads `SCAN h` for every
    origin row.
  - While a space is over quota, every pushed write but a delete moves to `sync_held` (`outbox.rs:217-230`).
    The engine keeps topping up from backfill and heal and pushing (`crates/koloda-sync/src/push.rs:32-55`).
    It releases only once a record shows room (`crates/koloda-sync/src/cycle.rs:105-111`).
    So a server below its 1 GiB free-disk watermark during a backfill fills `sync_held` with the whole database.
  - A re-bootstrap in that state, a fork or a return after 90 days, runs the cleanup in one transaction
    (`rebase.rs:54-65`).
    With 10k card creates and 300k held rows that is about 3 billion row reads.
  - `index_tests.rs:31-60` checks the plans of the per-row renumbering and cohort statements; this one is not listed.
- 4. Risk, Later: a quota release moves the whole held backlog into memory and the outbox at once.
  Decision: skipped (Open questions, 1).
  - `release_held` reads every `quota` and `dependency` row, envelopes included, into one `Vec`, and inserts them all
    into the outbox in one transaction (`outbox.rs:332-395`), as `PROTOCOL.md:1042-1043` (§Push outcomes) asks.
  - With finding 3's backlog the outbox then holds the whole database, against `PROTOCOL.md:1226` (§Backfill) and
    `crates/koloda-sync/src/push.rs:27-28`.
    Each push batch then groups the whole outbox (`outbox.rs:87-110`), about n²/2000 row reads for the drain.
  - Fix direction: release a push batch at a time and reword §Push outcomes, or stop engine top-ups while over quota.
- 5. Risk, Later: a cohort above the server's push cap blocks the outbox for good.
  Decision: skipped (Open questions, 1).
  - `push_batch` sends a cohort past either cap alone (`outbox.rs:100-102`).
    The server refuses more than `MAX_PUSH_ITEMS` (5,000) envelopes (`crates/koloda-sync-proto/src/transport.rs:48`;
    `crates/koloda-server/src/push.rs:230-233`).
    `push_refused` returns the cohort to `local` (`outbox.rs:540-552`), and the next push picks it first again.
  - Only `delete_cards` writes such a cohort today, in one transaction (`cards.rs:353-357`); the cards table keeps its
    selection across pages (`libs/srs-react/src/lib/cards/cards-table.tsx:46`, `:155`).
  - Fix direction: commit `delete_cards` in chunks below the cap, and have `Capture` refuse a larger commit.
- 6. Risk, Later: learning values are not versioned, and one this app refuses breaks every read.
  Decision: skipped (Open questions, 1).
  - Apply holds a learning value only when it is not JSON (`apply.rs:217-225`; `PROTOCOL.md:1110-1113`).
    A JSON value this app's validator refuses goes into the document (`apply.rs:711-745`).
  - Every read normalizes and validates it (`settings.rs:63`; `domain/settings.rs:76-80`), so the learning settings
    screen and today's review totals (`reviews.rs:164-170`) fail until another write replaces the key.
  - The value is JSON text under a fixed payload key, so a newer app can change it without the schema bump
    `PROTOCOL.md:1757` (§Schema versions) requires.
    `set_settings` compares the stored document with the normalized new one (`settings.rs:100-112`), so an older app
    re-sends a key it did not change, without the fields it does not know.
  - Fix direction: validate each learning value in `breaks_domain_rule`; compare normalized documents in
    `set_settings`.
- 7. Risk, Later: `due_transfers` reads the whole due queue for every 16 transfers.
  Decision: skipped (Open questions, 1).
  - It collects every due row, sorted, then stops at `limit` (`attachments.rs:89-119`); the queue has no index on
    `next_attempt_at` (`V10__sync_attachments.sql`).
    The engine asks for 16 at a time (`crates/koloda-sync/src/attachments.rs:22`, `:90`), so n due transfers cost
    about n²/16 row reads.
  - Download time dominates until backlogs of about 100k images.
  - Fix direction: page the query with `LIMIT` in a loop; index `(next_attempt_at, direction, id)`.

In:

- `koloda`: apply's starter overlay, client migration `V17` (an index on `sync_held`), the absence cleanup's
  statement, `index_tests.rs`, and the module docs in `mod.rs`.
- `crates/koloda-sync-proto/PROTOCOL.md`: §Seed identity, §Classes, the apply rule, a conformance case, and
  §Client state, each with the item that makes it true.
- `@koloda/db-sqlite`: rebuilt and tested against the new migration; no TS change.

Out:

- Findings 4 to 7 (Open questions, 1).
- The engine: it keeps pushing while over quota, which feeds findings 3 and 4.
- How the server orders an update that has no head yet; item 1 matches the devices to it instead.

## Open questions

- [x] 1. Triage? — as recommended (human, 2026-10-16).
  Fix 2 and 3, and 1 as a docs fix; 4 to 7 stay Later and are not scheduled.
- [x] 2. Flow? — `local` (human, 2026-10-16).

## Plan

- [x] 1. Overlay a joiner's edited starter rows with the space's values
  Goal (finding 2):
  - Apply overlays a starter row, the seed algorithm (`SEED_ALGORITHM_SIMPLE_ID`) or the seed template
    (`SEED_TEMPLATE_TYPE_ID`), while it has no create origin in `sync_origins`.
    That replaces today's test of no register and no origin (`apply.rs:416-436`, used at `apply.rs:379`).
  - The overlay decides each update group of the row on its own: `title`, `notes`, and `content` for the algorithm,
    `title`, `notes`, and `structure` for the template.
    - A group whose local register beats the create's stamp keeps its column and its register.
    - Any other group takes the create's column value and a synthetic register at the create's stamp, with that
      group's `initial_product_ts`.
      Its not-in-flight pending outbox row is deleted, as apply rule step 9 deletes one under a winning write; an
      in-flight row stays.
  - `created_at` always takes the create's value.
    The origin, the bootstrap mark, and `updated_at` then follow as for any create.
  - WHY for the trap comment: the server installs the joiner's edit as the group's first head whatever its stamp,
    while every other device applies it only over the create's floor.
    Deciding by stamp leaves the joiner where the others are.
  - `PROTOCOL.md`: §Seed identity (lines 226-228) says a starter row a joiner edited before the space's create
    applied is still overlaid, keeping only the groups its own write wins.
    §Classes (lines 290-291) and the apply rule's step 6 (line 401) name a seed row with no create origin, not a
    stamp-zero one.
    Add a conformance case: a joiner edits its starter algorithm before the space's create applies.
  Constraints:
  - Code changes stay in `apply.rs`: apply writes rows with its own SQL and never through a capturing repo path.
  - `join.rs` and `backfill.rs` stay as they are; a joiner still never pushes a seed create.
  - An unedited starter row overlays as today.
  Done when:
  - `only_an_untouched_seed_row_is_overlaid_by_a_remote_seed_create` (`sync_apply_integration_tests.rs:148`): in the
    touched case the edited title stays, notes and content take the space's values, and the origin is recorded.
  - A new case: a local edit whose stamp the space's create beats takes the create's value, keeps no pending row, and
    leaves a synthetic register at the create's stamp.
  - The touched case fails against today's `apply.rs`, checked once by hand.
  - `cargo test -p koloda` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — the edit must land while the join's download waits, which only the tests arrange reliably.
  Commit: Overlay a joiner's edited starter rows with the space's values
  Depends on: none

- [x] 2. Index held writes for the re-bootstrap cleanup
  Goal (finding 3):
  - Client migration `crates/koloda/src/migrations/V17__sync_held_entity.sql` adds
    `sync_held_kind_id_group_name_idx` on `sync_held (kind, id, group_name)`.
    Its WHY: a re-bootstrap keeps every create still held, and a quota hold can hold the whole backfill.
  - `absent_batch`'s statement (`rebase.rs:89-106`) becomes a `pub(super) const`, as `heal::IS_LAST_COHORT` is, with
    no change to what it selects.
  - `index_tests.rs` lists it for the aliases `h` (`sync_held`) and `x` (`sync_outbox`).
    Its module doc also names the absence cleanup among the statements that search an index.
  Constraints:
  - `agents/DB.md`: a new file, never an edit of an applied one; touch `migrations/mod.rs`; regenerate
    `schema-inventory.json` with `cargo test -p koloda --test integration write_schema_inventory_snapshot -- --ignored`;
    rebuild `@koloda/db-sqlite` (or `nx reset`) so its bundle embeds `V17`.
  - The web stack never writes `sync_held`, so no TS change.
  Done when:
  - `renumbering_and_cohort_reads_search_an_index` passes, and fails with `V17` removed, checked once by hand.
  - `cargo test -p koloda` and `bunx nx test @koloda/db-sqlite` pass, and `bun run check:push` is green.
  Manual verify: none — a query plan; nothing a user sees changes.
  Commit: Index held writes for the re-bootstrap cleanup
  Depends on: none

- [x] 3. Match the sync client-state docs to the code
  Goal (finding 1):
  - `PROTOCOL.md` §Client state, the `sync_state` row (line 1798): drop "skew", which the engine keeps in memory;
    the clock pause it records is already listed.
    Add the server URL and the bootstrap flag.
  - `mod.rs:239`: `SyncState.epoch` is the space's epoch the file last saw, which its calls name until a restore
    moves it.
  - `mod.rs:1-7`: the module map names `repair`, the repair of pointers whose referent died.
  Constraints: docs only.
  Done when: `bun run check:push` is green.
  Manual verify: none — docs only.
  Commit: Match the sync client-state docs to the code
  Depends on: none

## Outcome

Findings 1 to 3 are fixed.
4 to 7 are skipped as Later and not scheduled (Open questions, 1); their evidence and fix directions stay in Scope.

Shipped, one Plan item per commit:

- 2: apply overlays a seed row with no create origin, one update group at a time.
  A group whose local write beats the space's create keeps it; every other group takes the create's value and floor
  and loses its pending write.
  `PROTOCOL.md` §Seed identity, §Classes, the apply rule's step 6, and a new conformance case say so.
- 3: client migration `V17` indexes `sync_held (kind, id, group_name)`, and `index_tests.rs` checks the absence
  cleanup's held and outbox lookups.
- 1: §Client state lists the server URL and the bootstrap flag and no skew; the `SyncState.epoch` doc and the module
  map in `mod.rs` match the code.

Self-review added one commit: clearer wording in §Seed identity and in the `index_tests.rs` module doc.

Checked:

- `bun run check:push` passed on the final tip.
- `cargo test -p koloda` (297 integration, 395 domain) and `cargo test -p koloda-sync` (168) passed after items 1
  and 2; clippy was clean.
- `bunx nx test @koloda/db-sqlite` (91) passed with `V17` and the regenerated schema inventory.
- Both new overlay tests failed against the old `apply.rs`, and the index test failed with `V17` removed, each checked
  once by hand.

Manual verify: none — the overlay fix needs an edit while the join's download waits, which only the tests arrange,
and the other items are an index and docs.
