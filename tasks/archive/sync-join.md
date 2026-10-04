# Sync join

Status: done

## Intent

Let a desktop database join an existing space in each mode `crates/koloda-sync-proto/PROTOCOL.md` §Joining lists, except re-attach.
`koloda` tells which mode a file is in and records a claim.
It then turns the file into one the normal cycle can sync: Add remints the rows the space already holds, Replace clears local data, and a blank file seeds only its settings.
The engine task will make the pairing and `ids/known` calls and pass their answers in.
Until then, joins run in tests against the fake space.

Done when, with the fake space standing in for the server:

- a blank file, a file holding only the untouched seed rows, and a used file each join and converge with the space;
- after Add, a joiner and the space's other devices hold the union of both sides: rows the space already held come back once under their own ids and once under new ones, and other local rows keep their ids;
- after Replace, the joiner holds exactly the space's rows;
- the joining conformance cases in `PROTOCOL.md` pass;
- `bun run check:push` is green.

## Scope

In:

- Migration V8 adds the space id and the join phase (`import_pending` or `active`) to `sync_state`.
- `enroll_device` takes the space id.
- A local mode check: blank, untouched seed rows only, used, or active in this space (re-attach).
- Recording a claim: the file enters `import_pending`, where capture, backfill, and apply all stand still.
- A paged listing of the file's hot-lane ids for the probe.
- Add: remint every known entity and its dependents, apply the seed-row rules, keep `learning` at stamp zero, and start the backfill as a joiner.
- Replace: delete every product row, keep device-local data, and start as a blank joiner.
- A blank joiner's seed: device-local settings and the `learning` document, no seed rows.
- A fake-space probe that answers which ids its log holds live or fenced.
- `PROTOCOL.md`, README, and `agents/RUST.md` updates, each with the item that makes it true.

Out:

- Pairing preview and claim, chunking the `ids/known` calls, the setup hint, and the union bootstrap (the sync engine task).
- Re-attach after the mode check names it: the "behind" procedure and the epoch check (the sync engine task).
- The join wizard, Settings → Sync, and NAPI commands (the desktop UI task).
- Cancelling a pending import; the claim cannot be undone without a server call.
- Creating a space from a file enrolled in another one; `enroll_device` keeps refusing a file that has sync state.
- The epoch and rebase barrier columns (the recovery work).
- The web host: it does not sync (`docs/decisions/APP-ROLES.md`).

## Open questions

- [x] Area guides? — the same as sync-backfill (`agents/RUST.md`, `agents/DB.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, `agents/TESTING.md`, `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md`, `agents/MARKDOWN.md`, and `crates/koloda-sync-proto/PROTOCOL.md`), plus `agents/REVIEW.md` for self-review.
- [x] What makes a seed row unmodified? — a NULL `updated_at`. Every save sets it, even one that changes nothing, so a no-op save counts as modified and the row is reminted. Rust cannot compare against the first-run content, which the TS host supplies.
- [x] When are a file's old sync tables cleared? — when the claim is recorded, not at Add. The old device id is replaced at that point anyway, and a clean pending state cannot push or apply anything from the old space. `PROTOCOL.md` moves "clear every sync table" from Add's steps to the claim.
- [x] While import is pending, does capture record local writes? — no. Capture, backfill, and apply all stand still. Add's backfill picks up any row written meanwhile, and Replace deletes it.
- [x] Space id format? — a UUID stored as a 16-byte blob, like `device_id`.
- [x] Does Replace keep attachments and conversations? — yes, both. Conversations are device-local. Attachments are content-addressed, so cards arriving from the space reuse local bytes, and the startup sweep removes images no card references.

## Plan

- [x] 1. Record the space and import phase for a joining file
  Goal: migration `V8__sync_join.sql` adds `space_id` and `join_phase` to `sync_state`. `join_phase` is `import_pending` or `active` and defaults to `active`.
  Refresh the embedded listings on both hosts and the schema inventory per `agents/DB.md`.
  `enroll_device(db, device_id, space_id, role)` stores the space id. The space's creator and a blank joiner enroll this way.

  New module `crates/koloda/src/repo/sync/join.rs`:
  - `join_mode(db, space_id)` returns `JoinMode::{Blank, UntouchedSeed, Used, Reattach}`:
    - `Reattach`: sync state is `active` in that space;
    - `Blank`: no settings rows, as `get_db_status` reports `Blank`;
    - `UntouchedSeed`: the only product rows are the unmodified seed algorithm with its one revision and the unmodified seed template; `learning` does not count;
    - `Used`: anything else, including a file active or pending in another space.
  - `begin_import(db, device_id, space_id)` records a claim for an untouched-seed or used file. In one transaction it clears every sync table and writes a fresh `import_pending` state row with the new device and space, cursors and sequence reset, and no backfill stamps.
  - `probe_ids(db, after, limit)` pages through the file's hot-lane ids in a stable `(kind, id)` order: algorithms, algorithm revisions, templates, decks, and cards, seed ids included. Reviews and `learning` are left out.

  While import is pending, `Capture` writes nothing, and `backfill_batch` and `apply_page` return a protocol error.
  Docs:
  - `PROTOCOL.md` §Client state names the space id and join phase.
  - `PROTOCOL.md` §Joining says how a file's mode is told, what makes a seed row unmodified, and that recording the claim clears the sync tables and stops capture.
  - `agents/RUST.md` gets a routing row and a "Join" note; the crate README map gets `join.rs`.
  Constraints:
  - no production caller;
  - `enroll_device` still refuses a file that has sync state;
  - a file that is not pending captures, backfills, and applies exactly as before.
  Done when: tests in `crates/koloda/tests/integration/sync_join_integration_tests.rs` cover:
  - Modes:
    - a fresh database is `Blank`;
    - a seeded one is `UntouchedSeed`;
    - a seeded one with an edited seed, an extra deck, or only a custom algorithm is `Used`;
    - a file active in this space is `Reattach`;
    - a file active in another space, or pending in this one, is decided by its rows.
  - Claim. `begin_import` on a file active in another space leaves no stamps, origins, outbox rows, cohorts, or tombstones; it records the new device and space with reset cursors and sequence and no backfill stamps.
  - Pending. A product write while pending captures nothing, and `backfill_batch` and `apply_page` fail.
  - Probe. Paging with a small limit lists every hot-lane id once, seed ids included, and no review or `learning` id.

  `cargo test -p koloda` and `bunx nx test @koloda/db-sqlite` (after rebuilding the web bundle) are green.
  Commit: Record the joined space and the import phase
  Depends on: none

- [x] 2. Remint known rows when a used database joins
  Goal: `add_to_space(db, known)` takes the probe's answer, each known id marked live or fenced, and works only on a pending file.
  In one transaction it:
  1. remints each known entity other than a seed row, and its dependents, with fresh UUIDv7 ids, rewriting every pointer that names them:
     - a deck with its cards and their reviews (`cards.deck_id`, `reviews.card_id`);
     - a card with its reviews;
     - an algorithm with its revisions (`decks.algorithm_id`, `algorithm_revisions.algorithm_id`, and the `learning` default);
     - a template alone (`decks.template_id`, `cards.template_id`, and the `learning` default);
     - a revision alone;
  2. leaves seed ids as they are (item 3 adds their rules);
  3. turns the file `active` as a joiner and reserves the backfill stamps through the enrollment path.

  Live and fenced ids are reminted alike.
  Reminted rows keep every other column, including `created_at` and `updated_at`.
  Test support in `crates/koloda/tests/common/sync.rs`:
  - `FakeSpace::known(ids)` answers a probe from its log. An id with a create or immutable envelope is live. A tombstoned id, or a card under a tombstoned deck, is fenced.
  - A helper copies a database, so a test can hold a never-synced copy of a file that later syncs.

  Docs: `PROTOCOL.md` §Joining's Add steps match, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` notes that desktop repos also join.
  Constraints:
  - foreign keys stay on; the transaction may defer their checks;
  - attachments, template field ids, conversations, and other device-local data are never rewritten;
  - nothing is captured during the remint; backfill enqueues the result.
  Done when: tests cover:
  - Unrelated database. Add remints nothing; after the joiner drains its backfill and both replicas pull, they hold the union.
  - Copy. A copy taken before its original created the space remints exactly the known entities and their dependents (conformance case "Add of a copy").
    - Rows the copy added afterwards keep their ids and follow reminted referents.
    - A row the space deleted is reminted too.
    - After both replicas sync, each holds both versions of every known entity, and the log passes `assert_referents_first`.
  - Pointers. A reminted deck still points at an algorithm that was not known. Cards on a reminted template keep their content and field ids. The `learning` defaults follow a reminted algorithm and template.
  - Device-local data. A conversation and an attachment survive Add unchanged.
  Commit: Remint rows the space already holds when a database joins
  Depends on: 1

- [x] 3. Keep, delete, or remint seed rows on join
  Goal: `add_to_space` applies the seed-row rules in `PROTOCOL.md` §Joining:
  - if the space holds the seed algorithm live, it keeps its id while unmodified, and its local revisions are deleted so the space's history arrives;
  - if the space holds the seed template live, it keeps its id while unmodified and no local card uses it;
  - an edited seed, or a seed template with local cards, is reminted like any other row;
  - if the space does not hold a seed live, an unmodified seed that no local deck or card uses is deleted, with its revisions; any other is reminted.

  `UntouchedSeed` files go through the same `begin_import` and `add_to_space` without asking the user.
  The backfill tests' `joiner()` fixture joins through this path instead of deleting the seed revisions by hand.
  Docs: `PROTOCOL.md` §Joining says an untouched-seed file joins through Add without a choice.
  Constraints: `learning` stays at stamp zero, and a joiner never enqueues a seed id.
  Done when: tests cover the conformance cases:
  - "Start-fresh-then-Join overlays seeds". An untouched-seed file joining a space that holds both seeds keeps them at stamp zero without their local revisions. The space's creates overlay them, and the joiner's backfill pushes nothing.
  - "Start-fresh-then-Join does not push a second initial seed revision".
  - "Start-fresh-then-Join into a space that deleted the seed template". The local seed template is deleted and never pushed.
  - "Add keeps an unmodified seed algorithm and remints a used seed template".
  - "Add with decks on an unmodified seed algorithm the space deleted". The seed is reminted and its decks follow; an unused one is deleted.

  An edited seed algorithm that the space holds live is reminted with its revisions.
  Commit: Keep, delete, or remint seed rows when a database joins
  Depends on: 2

- [x] 4. Replace local data or join as a blank database
  Goal: `replace_with_space(db)` works only on a pending file.
  In one transaction it deletes every review, card, deck, algorithm revision, algorithm, and template. It then turns the file `active` as a joiner and reserves the backfill stamps.
  It keeps:
  - the settings rows; `learning` stays at stamp zero for the space to overlay;
  - conversations;
  - attachments, which the startup sweep removes once no card references them.

  `seed_joiner_db(db, settings)` in `crates/koloda/src/app/init.rs` seeds a blank file the way `seed_db` does, but without the seed algorithm and template. The `learning` defaults name the seed ids, and the space's `learning` overlays them.
  The blank joiner then enrolls with `enroll_device` as a joiner.
  Docs: `PROTOCOL.md` §Joining says what Replace keeps and what a blank joiner's defaults name.
  Done when: tests cover:
  - "Replace leaves no local product rows". After Replace the file has no product rows and no sync rows besides its state. Its settings, conversation, and attachment are unchanged, its backfill pushes nothing, and after a pull it holds exactly the space's rows.
  - "Space created after its device deleted the seed algorithm", for a blank joiner: no seed rows after seeding, and after a pull its `learning` defaults name the creator's real default, not the seed id.

  `bun run check:push` is green.
  Commit: Replace local data or start blank when joining a space
  Depends on: 2

## Outcome

- Migration `V8__sync_join.sql` adds `space_id` and `join_phase` (`import_pending` or `active`) to `sync_state`. `enroll_device` takes the space id.
- `join_mode` tells a file's mode: `Reattach` when it is active in that space, `Blank` with no settings rows, `UntouchedSeed` when its only rows are the unmodified seed algorithm with its one revision and the unmodified seed template, and `Used` otherwise. A seed row is unmodified while its `updated_at` is NULL.
- `begin_import` records a claim: it clears every `sync_*` table and writes a fresh `import_pending` state row. While pending, `Capture` records nothing, and `backfill_batch` and `apply_page` refuse. `PROTOCOL.md` moves "clear every sync table" from Add's steps to the claim.
- `probe_ids` pages through algorithm, revision, template, deck, and card ids, seed ids included.
- `add_to_space` takes the probe's answer (`Known::Live` or `Known::Fenced`). In one transaction it applies the seed-row rules, remints every known entity with its dependents and rewrites the pointers and `learning` defaults that name them, then turns the file `active` as a joiner and reserves the backfill stamps. Dependents move with a known parent even when the space never saw them. An untouched-seed file joins through the same path without a choice.
- `replace_with_space` deletes every product row and keeps settings, conversations, and attachments. `seed_joiner_db` seeds a blank joiner's settings with `learning` defaults on the seed ids; the blank joiner then enrolls as a joiner.
- `PROTOCOL.md` §Joining, `agents/RUST.md`, the crate README, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` describe and route the join.
- Deviations from the plan text:
  - `FakeSpace::known(ids)` became `FakeSpace::probe(replica)`, which pages `probe_ids` itself; `FakeSpace::join_by_add` claims, probes, and adds.
  - `copy_of` needs rusqlite's `backup` feature, added as a dev dependency only.
  - `seed_db` and `seed_joiner_db` share `parse_learning_settings`.
  - The backfill tests' `joiner()` fixture became `joiner(&space)` and is created after the creator pushes, so it probes a space that holds the seed rows.
  - Self-review added a seed-template case table (live, fenced, edited, used only by decks) and the error for a kind `probe_ids` does not list.
- Manual verify: none — nothing calls the join yet, so no user-visible behavior changed.
