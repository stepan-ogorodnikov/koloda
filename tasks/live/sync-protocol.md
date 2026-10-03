# Sync protocol

Status: draft

## Intent

Put the accepted sync engine design into the repo as code and a contract, so later sync tasks build on `main` instead of a gitignored draft.
The design is `tmp/explorations/SYNC-ENGINE-PROPOSAL.md`, revision 3, accepted 2026-10-03; it exists only on the owner's machine until this task moves its protocol part into the repo.

This task adds a pure Rust crate, `crates/koloda-sync-proto`, that defines what travels between devices and the server: the envelope and its header, the hybrid logical clock, the registry of syncable kinds and field groups, and the CBOR codec for every payload.
It has no database, no network, and no product behavior, so it needs no spec change.

Done when: `crates/koloda-sync-proto/PROTOCOL.md` states the protocol contract; the crate encodes and decodes every kind and group of the registry, round-trips every payload with a check, orders stamps as the contract says, and passes conformance fixtures that later server and engine tests can load; the sync rulings that reach beyond sync are recorded in `docs/decisions/`; `bun run check:push` is green.

## Scope

In:

- `crates/koloda-sync-proto` as a workspace member with an nx project, so lint and tests run in `check:push`.
- `PROTOCOL.md`: the protocol sections of the proposal (envelope, header fields, field groups and classes, apply rule, ordering and HLC, cohorts, sender sequences, push outcomes, endpoints, lanes, corrupt-envelope handling, schema versions, restore and fork procedures as protocol steps).
- Decisions: enrolled devices in a space are trusted; product timestamps are never merge keys; a card's deck and template never change after creation.
- Types and code: envelope header, `Op`, kind and group registry (class, lane, parent, hard and soft refs, `updated_at` contribution), HLC, payload structs for schema 1 of every kind, CBOR codec, digest, encode-with-round-trip check, header allowlist and size limits.
- Conformance fixtures: golden envelopes for every kind and group, and stamp-ordering cases.

Out:

- Sync tables, capture, apply, repair, backfill, and every other change to `crates/koloda`.
- `koloda-server`, `koloda-sync`, transport, endpoints as code, NAPI, uniffi, UI.
- Product specs (`SYNC.md`, `SYNC-SERVER.md`, seed undeletability, displayed reset time); each lands with the task that makes it true.
- Behavior-only parts of the proposal (join wizard wording, operator commands, restore as users see it); they stay in the draft until their tasks.
- E2EE, attachment transfer, mobile.

## Open questions

- [ ] Area guides for this change? — open; to be routed by the human. Likely `agents/RUST.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/TESTING.md`, `agents/MARKDOWN.md`, and whatever governs `docs/decisions/`.
- [ ] `PROTOCOL.md` scope: protocol sections only, or the whole proposal trimmed later as specs take parts over? — open. Recommendation: protocol only, so nothing on `main` describes product behavior that does not exist.
- [ ] Where do the behavior-only parts of the proposal live until their tasks? — open. Options: stay in gitignored `tmp/`; or land as a clearly marked design note under `docs/`. Recommendation: stay in `tmp/`; the first task that needs them moves them into a spec.
- [ ] CBOR crate? — open. Candidates: `ciborium` (serde, widely used) or `minicbor` (no serde, explicit, smaller). Recommendation: `ciborium`, so payload structs share serde derives with the domain style.
- [ ] Digest algorithm? — open. Recommendation: SHA-256 via `sha2`, already a dependency of `koloda` and used for attachment ids.
- [ ] Payload types: dedicated wire structs in the proto crate, or the `koloda` domain types? — open. Recommendation: dedicated wire structs; the proto crate must not depend on `koloda`, and the server links only the proto crate.
- [ ] One decision file per ruling, or one sync decision file with three rulings? — open. Recommendation: one per ruling; each has its own "applies when".

## Plan

- [ ] 1. Record the sync rulings as decisions
  Goal: add three files to `docs/decisions/` in the existing Ruling / Why / Applies when shape (see `docs/decisions/MEDIA-STORAGE.md`).
  (a) Enrolled devices in one sync space are trusted: the server defends against callers without a token, revoked devices, client bugs, and resource exhaustion, not against an enrolled device; why: one person owns every device in a space, a lying device could already publish valid deletes, and revocation plus authoritative restore are the remedies.
  (b) Product timestamps (`created_at`, `updated_at`, `last_reviewed_at`, reset time, UUIDv7 time) are never merge keys or distributed order; why: device clocks are wrong, and sync orders by hybrid logical clock stamps.
  (c) A card's deck and template are fixed at creation; a feature that moves a card or changes its template must first choose a delete-cascade strategy; why: sync cascades a deck or template delete to cards by the parent and template recorded at creation.
  Constraints: docs only; no sync terms that need the protocol to understand (link `crates/koloda-sync-proto/PROTOCOL.md` only once it exists, in item 2); follow the markdown rules.
  Done when: markdown lint passes; each file reads on its own.
  Commit: <candidates presented in chat>
  Depends on: none

- [ ] 2. Add the koloda-sync-proto crate and its protocol contract
  Goal: new library crate `crates/koloda-sync-proto` (workspace member in the root `Cargo.toml`, `serde` dependency, workspace lints), a `project.json` with lint and test targets wired like `crates/koloda/project.json`, a `README.md`, and `PROTOCOL.md` transcribed from the protocol sections of `tmp/explorations/SYNC-ENGINE-PROPOSAL.md` per the open question on scope.
  `PROTOCOL.md` opens with "the contract between `koloda-sync` and `koloda-server`; update this file in the same change as the code", like `apps/electron/IPC.md`.
  Link it from the decisions added in item 1.
  Constraints: no code beyond an empty `lib.rs` with a module doc; no dependency on `koloda`; no product behavior in `PROTOCOL.md`.
  Done when: `cargo build -p koloda-sync-proto` and workspace clippy green; `nx run koloda-sync-proto:test` runs (no tests yet); markdown lint passes.
  Commit: <candidates presented in chat>
  Depends on: 1

- [ ] 3. Define the kind and field-group registry
  Goal: `Kind`, `Group`, `Op`, `Class` (create, update, immutable), `Lane` (hot, cold), and one registry entry per kind listing its groups with class, lane, parent kind, hard refs, soft refs, and whether the group contributes to `updated_at`, exactly as the field-group table in `PROTOCOL.md`: cards (create, content, scheduling, reset), reviews (row), decks (create, title, notes, algorithm, template), templates (create, title, notes, structure), algorithms (create, title, notes, content), algorithm_revisions (row), settings.learning (defaults.algorithm, defaults.template, dailyLimits, dayStartsAt, learnAheadLimit).
  Header allowlist: a `(kind, group, op)` triple and its lane are valid only if the registry says so.
  Constraints: string ids on the wire for kinds and groups; no payload types yet.
  Done when: unit tests assert every table row of `PROTOCOL.md`, reject unknown triples and lane mismatches; `cargo test -p koloda-sync-proto` green.
  Commit: <candidates presented in chat>
  Depends on: 2

- [ ] 4. Encode and decode the envelope header and frame
  Goal: the envelope (`kind`, `id`, `parent`, `refs`, `group`, `op`, `hlc`, `stamp_device`, `schema`, `commit_id`, opaque `payload` bytes), its CBOR encoding, the digest, and decode limits (body size, nesting depth, payload size) returning typed errors.
  The header encodes to bytes on its own, because E2EE later uses them as AEAD associated data.
  Constraints: payload stays opaque bytes here; validation against the registry from item 3; deterministic encoding (fixed field order) so golden bytes are stable.
  Done when: round-trip, digest, limit, and allowlist tests green.
  Commit: <candidates presented in chat>
  Depends on: 3

- [ ] 5. Add the hybrid logical clock
  Goal: 64-bit stamp (48 bits wall milliseconds, 16 bits counter); `tick(now)` for a local commit; `observe(stamp)` adopting a remote stamp; counter overflow advances the wall part one millisecond; total order on `(hlc, stamp_device)`; helpers for the skew rules in `PROTOCOL.md` (client pause above 5 minutes; server rejects a wall part more than 5 minutes ahead of server now).
  Constraints: no clock source inside the crate; callers pass time in; state is a plain value the caller persists.
  Done when: tests cover monotonicity, adoption from ahead, overflow, tie-break by device, and both skew rules.
  Commit: <candidates presented in chat>
  Depends on: 2

- [ ] 6. Encode every schema-1 payload with a round-trip check
  Goal: wire structs for the payload of every registry group at schema 1, matching the column lists in `PROTOCOL.md` (including `initial_product_ts` on creates, `product_ts` on contributing groups, `wall_ms` on `cards.reset`, `successor` hint on algorithm deletes); `encode_checked`, which encodes, decodes, and compares before returning bytes, so an encoder bug fails the caller's write; header-to-payload consistency helpers that build `parent` and `refs` from the payload, so they agree by construction.
  Constraints: dedicated wire structs per the open question; no dependency on `koloda`.
  Done when: every group has a round-trip test, a deliberately lossy encoder fails `encode_checked`, and refs built from payloads match the registry.
  Commit: <candidates presented in chat>
  Depends on: 4

- [ ] 7. Add conformance fixtures
  Goal: a `fixtures/` directory of golden envelopes, one or more per kind and group (bytes plus a readable decoded form), and stamp-ordering cases (ties, overflow, the tied reset-versus-grade order), with a loader other crates can use from tests; a test that every registry entry has a fixture and every fixture decodes to its readable form.
  Constraints: fixtures are data, not generated at test time; a codec change that alters bytes must update fixtures in the same change.
  Done when: fixture tests green; `bun run check:push` green.
  Commit: <candidates presented in chat>
  Depends on: 5, 6

## Outcome

<what shipped>
