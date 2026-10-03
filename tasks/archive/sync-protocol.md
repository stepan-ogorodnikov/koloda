# Sync protocol

Status: done

## Intent

Put the accepted sync engine design into the repo as code and a contract, so later sync tasks build on `main` instead of a gitignored draft.
The design is `tmp/explorations/SYNC-ENGINE-PROPOSAL.md`, revision 3, accepted 2026-10-03; it exists only on the owner's machine until this task moves its protocol part into the repo.

This task adds a pure Rust crate, `crates/koloda-sync-proto`, that defines what travels between devices and the server: the envelope and its header, the hybrid logical clock, the registry of syncable kinds and field groups, and the CBOR codec for every payload.
It has no database, no network, and no product behavior, so it needs no spec change.

Done when: `crates/koloda-sync-proto/PROTOCOL.md` states the protocol contract; the crate encodes and decodes every kind and group of the registry, round-trips every payload with a check, orders stamps as the contract says, and pins schema-1 bytes with golden fixtures; the one sync ruling that reaches beyond sync is recorded in `docs/decisions/`; `bun run check:push` is green and runs the new crate's lint and tests.

## Scope

In:

- `crates/koloda-sync-proto` as a workspace member with an nx project, wired into `check:commit` and `check:push`.
- `PROTOCOL.md`: the protocol sections of the proposal, including its trust model and rulings.
- Decision `docs/decisions/FIXED-CARD-PARENTS.md`: a card's deck and template are fixed at creation.
- `agents/INDEX.md` rows routing sync protocol work and the new decision.
- Types and code: envelope header, `Op`, kind and group registry (class, lane, parent, hard and soft refs, `updated_at` contribution), HLC, payload structs for schema 1 of every kind, CBOR codec, SHA-256 digest, encode-with-round-trip check, header allowlist and decode limits.
- Golden fixtures pinning schema-1 envelope bytes.

Out:

- Sync tables, capture, apply, repair, backfill, and every other change to `crates/koloda`.
- `koloda-server`, `koloda-sync`, transport, endpoints as code, NAPI, uniffi, UI.
- Product specs (`SYNC.md`, `SYNC-SERVER.md`, seed undeletability, displayed reset time); each lands with the task that makes it true.
- Behavior-only parts of the proposal (join wizard wording, operator commands, restore as users see it); they stay in the gitignored draft until their tasks move them into specs.
- A fixture loader for other crates; the first task that needs one adds it.
- E2EE, attachment transfer, mobile.

## Open questions

- [x] Area guides for this change? — `agents/TASKS.md` and `agents/IMPLEMENTATION-PLAN.md` for the task; `agents/MARKDOWN.md` for `PROTOCOL.md`, the README, and INDEX rows; `agents/DECISIONS.md` for the decision; `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md` (change discipline), and `agents/TESTING.md` for code. `agents/RUST.md` and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` do not apply: the crate is not `koloda`, has no TypeScript twin, and the web host does not sync. Self-review adds `agents/REVIEW.md`.
- [x] `PROTOCOL.md` scope? — protocol sections only, so nothing on `main` describes product behavior that does not exist.
- [x] Where do the behavior-only parts live until their tasks? — they stay in the gitignored draft; the first task that needs them moves them into a spec.
- [x] CBOR crate? — `ciborium`, so payload structs use serde derives like the rest of the Rust code.
- [x] Digest algorithm? — SHA-256 via `sha2`, already used for attachment ids.
- [x] Payload types? — dedicated wire structs in the proto crate; it must not depend on `koloda`, and the server links only the proto crate.
- [x] Which rulings become decisions? — only fixed card parents. Per `agents/DECISIONS.md`, a decision needs a ruling that spans layers with no single home. The trust model and "product timestamps are never merge keys" bind only sync code, so `PROTOCOL.md` is their home. Fixed card parents binds `docs/specs/CARDS.md`, `koloda`, and sync; an agent allowing card moves would not open `PROTOCOL.md`. It lands with the registry item, which encodes it.

## Plan

- [x] 1. Add the koloda-sync-proto crate and its protocol contract
  Goal: new library crate `crates/koloda-sync-proto`: workspace member in the root `Cargo.toml` (dependencies arrive with the items that use them), `[lints] workspace = true`, `src/lib.rs` with only a module doc pointing at `PROTOCOL.md` and the README.
  `project.json` with `lint` and `test` targets shaped like `crates/koloda/project.json`; wire them into the root `check:rust` and `check:rust-push` scripts so `check:commit`, `check:push`, and CI run them, with nx cache inputs covering the new crate (the existing `koloda:lint` cache is keyed on `crates/koloda` only).
  `README.md` in the shape of `crates/koloda/README.md`: where it sits (linked by the future sync engine and server; never by the web host), architectural map, and "Does NOT own" (sync tables and apply, transport, the server, product behavior).
  `PROTOCOL.md`, transcribed from the draft: trust model; envelope header and what the server reads; field groups, classes, existence and order, registers, `updated_at`, apply rule, collision outcomes; deletes, cascades, reset, referent repair, arrivals; HLC, skew guards, cohorts, sender sequence, pull cursor, legacy backfill phases; devices and the behind/fork procedure; endpoints, push outcomes, holds, corrupt envelopes, lanes, cycle, outbox, backfill, bootstrap, metered pause; re-bootstrap, heal and authoritative restore; join probe, Add and Replace remint rules, re-attach; attachment refs, upload, download, lifetime, E2EE wire ids; schema versions; client sync tables; the accepted rulings (no change history, no rejected list); conformance cases.
  It opens with: the contract between the sync engine and the server; update it in the same change as the code it describes, like `apps/electron/IPC.md`.
  `agents/INDEX.md`: an Authoring row and a Reviewing row for sync protocol work routing to `crates/koloda-sync-proto/PROTOCOL.md` and the crate README, plus `agents/TESTING.md` as for any test change.
  Constraints: no code beyond the module doc; no dependency on `koloda`; `PROTOCOL.md` states what devices and the server exchange and how each applies it, never UI wording or operator CLI detail; follow `agents/MARKDOWN.md`.
  Done when: `cargo build -p koloda-sync-proto` green; `bun run check:rust-push` runs the new crate's lint and test targets.
  Commit: Add the koloda-sync-proto crate with its protocol contract
  Depends on: none

- [x] 2. Define the kind and field-group registry
  Goal: `Kind`, `Group`, `Op`, `Class` (create, update, immutable), `Lane` (hot, cold), and one registry entry per kind listing its groups with class, lane, parent kind, hard refs, soft refs, and whether the group contributes to `updated_at`, as the field-group and refs tables in `PROTOCOL.md`: cards (create, content, scheduling, reset), reviews (row), decks (create, title, notes, algorithm, template), templates (create, title, notes, structure), algorithms (create, title, notes, content), algorithm_revisions (row), settings.learning (defaults.algorithm, defaults.template, dailyLimits, dayStartsAt, learnAheadLimit).
  The header `op` is `write` (names a group; the group's class decides create, update, or immutable insert) or `delete` (names no group).
  A header allowlist accepts a `(kind, group, op)` only when the registry allows it: the group belongs to the kind, a write names a group, a delete names none and targets a kind with tombstones (not reviews, revisions, or settings); a lane check accepts a kind only in its own lane.
  Add `docs/decisions/FIXED-CARD-PARENTS.md` per `agents/DECISIONS.md`: a card's deck and template are fixed at creation and never appear in an update group; a feature that moves a card or changes its template must first pick a delete-cascade strategy (birth parent, per-card tombstones, or server-reported deaths); why: sync cascades a deck or template delete to cards by the parent and template recorded at creation.
  Point at it from `PROTOCOL.md` and from a new `agents/INDEX.md` Authoring row for moving a card or changing its template (with `docs/specs/CARDS.md`).
  Constraints: string ids on the wire for kinds and groups; no payload types yet; tests in one test crate root `tests/protocol/main.rs` with modules, no extra roots.
  Done when: one table-driven allowlist test covers accepted triples and each rejection (unknown kind, group, or op; group not in the kind; write without a group; delete with a group; delete on a kind without tombstones) with exact error variants, plus a lane test; `cargo test -p koloda-sync-proto` green.
  Commit: Define the sync kind and field-group registry
  Depends on: 1

- [x] 3. Add the hybrid logical clock
  Goal: 64-bit stamp (48 bits wall milliseconds, 16 bits counter); `tick(now)` for a local commit; `observe(stamp)` adopting a remote stamp, including one from ahead; counter overflow advances the wall part one millisecond; total order on `(hlc, stamp_device)`; checks for the skew rules in `PROTOCOL.md`: the client pauses when skew exceeds 5 minutes, and the server rejects a wall part more than 5 minutes ahead of server now.
  Constraints: no clock source inside the crate; callers pass time in; state is a plain value the caller persists.
  Done when: tests cover monotonicity under a backwards wall clock, adoption from ahead, overflow, the device tie-break, and both skew rules at exactly 5 minutes and one millisecond past.
  Commit: Add the hybrid logical clock for sync stamps
  Depends on: 1

- [x] 4. Encode and decode the envelope header and frame
  Goal: the envelope (`kind`, `id`, `parent`, `refs`, `group`, `op`, `hlc`, `stamp_device`, `schema`, `commit_id`, opaque `payload` bytes), its CBOR encoding with `ciborium`, the SHA-256 digest with `sha2`, and decode limits (header size, payload size) returning typed errors; every field decodes into a fixed type, so nesting depth needs no separate limit.
  Decoding validates the header against the registry allowlist.
  The header encodes to bytes on its own, because E2EE later uses them as AEAD associated data.
  Constraints: payload stays opaque bytes here; deterministic encoding (fixed field order) so golden bytes are stable.
  Done when: tests cover header round-trip, digest stability across re-encode, each decode limit at the limit and one past, and allowlist rejection on decode.
  Commit: Encode and decode sync envelopes
  Depends on: 2, 3

- [x] 5. Encode every schema-1 payload with a round-trip check
  Goal: wire structs for the payload of every registry group at schema 1, matching the column lists in `PROTOCOL.md`, including `initial_product_ts` on creates, `product_ts` on contributing groups, `wall_ms` on `cards.reset`, and the `successor` hint on algorithm deletes.
  `seal` builds the header from the payload, encodes, decodes, and compares before returning bytes, so an encoder bug fails the caller's write.
  Header builders derive `parent` and `refs` (hard and soft) from the payload, so they agree by construction.
  Constraints: dedicated wire structs; no dependency on `koloda`; one table-driven round-trip test across groups rather than one test per group.
  Done when: every group round-trips; a payload that cannot round-trip (a NaN stability) fails `seal` with its error; refs derived from a card payload name its template and its linked attachment ids.
  Commit: Encode sync payloads with a round-trip check
  Depends on: 4

- [x] 6. Add conformance fixtures
  Goal: `fixtures/` with golden envelopes for every kind and group at schema 1, as hex of the sealed bytes; the readable form is the matching entry in `tests/protocol/samples.rs`; a table-driven test seals each sample to the golden bytes and decodes the golden bytes back to the sample; an ignored test regenerates the files, like koloda's schema inventory snapshot.
  Constraints: fixtures are data, not generated at test time; a codec change that alters bytes updates fixtures in the same change.
  Done when: fixture tests green; `bun run check:push` green.
  Commit: Add sync protocol conformance fixtures
  Depends on: 5

## Outcome

- `crates/koloda-sync-proto` exists as a workspace member with its own nx `lint` and `test` targets, wired into `check:commit`, `check:rust`, `check:rust-push`, and `test:rust`.
- `crates/koloda-sync-proto/PROTOCOL.md` holds the protocol part of the accepted design (revision 3); behavior-only parts stay in the gitignored draft until their tasks move them into specs.
- `docs/decisions/FIXED-CARD-PARENTS.md` records that a card's deck and template never change; `agents/INDEX.md` routes it and the sync protocol crate.
- The crate implements the kind and field-group registry with the header allowlist, the hybrid logical clock with skew guards, the CBOR envelope codec with SHA-256 digest and size limits, schema-1 payloads for every group, and `seal`, which builds the header from the payload and round-trips before returning bytes.
- Golden fixtures pin the sealed bytes of 28 samples (every group plus the four deletes); an ignored test regenerates them.
- Deviations from the first plan text, reflected in the items: the header `op` is only `write` or `delete`; no separate nesting-depth limit, because every field decodes into a fixed type; fixtures are hex with `samples.rs` as their readable form; dependencies arrived with the items that use them.
- Manual verify: none — no user-visible surface.
