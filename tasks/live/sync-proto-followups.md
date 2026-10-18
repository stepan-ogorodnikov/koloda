# Sync protocol audit follow-ups

Status: draft
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda-sync-proto/PROTOCOL.md, crates/koloda-sync-proto/README.md, crates/koloda/src/repo/sync/README.md, agents/RUST.md, agents/TESTING.md, agents/CODE-DOCUMENTATION.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

Fix the findings that the `sync-proto-audit` task left as Later, and the two loose ends `sync-repo-followups` left.
The findings come from the audit of the sync wire protocol (`crates/koloda-sync-proto`) at `9c4b5fa8` (`main`).
Its report was `tmp/audits/sync-proto.md`, which git ignores.
`tasks/archive/sync-proto-audit.md` kept their evidence, and `tasks/archive/sync-repo-followups.md` (Outcome) kept the
loose ends.
This file restates both, so none of them needs to be open.
Each finding was checked again against `4fa1881b` when this task was scheduled, and each still holds.

Finding 16, how an older app reads a newer server's error code or outcome, is decided and is its own task,
`sync-unknown-codes` (Open questions 2).

Done when:

- a payload in any encoding but the one sealing writes fails to decode, and so does a successor on a delete of a kind
  other than algorithms;
- a push outcome with a key its status lacks fails to decode;
- a capture that writes one group twice keeps its cohort, so its outbox row is never left without one;
- the protocol tests pin each group's class and `updated_at` contribution, a sample for every group and delete, every
  error code's wire string, the envelope cap one past, and the frame's key list;
- the protocol crate exports nothing that only it uses;
- §Conformance cases lists the three rules `sync-repo-followups` added;
- `bun run check:push` is green.

## Scope

Findings, numbered as in the report, then the loose ends as R1 and R2.
Line numbers are at `4fa1881b`.

- 4. Spec violation, Later: `Outcome` accepts unknown keys.
  Decision: fix by item 2.
  - §Bodies (`PROTOCOL.md:917`): bodies are CBOR maps that reject unknown keys.
  - `Outcome` is internally tagged without `deny_unknown_fields` (`transport.rs:331-342`).
    The audit's probe: `{status: applied, extra: 1}`, `{status: held, reason: quota, extra: 1}`, and a `PushOutcome`
    and a `Receipt` whose `outcome` carries an extra key all decode.
  - `deny_unknown_fields` on the enum alone catches the struct variant but not a unit variant with an extra key.
  - Fix direction: decode `Outcome` through a private struct with `deny_unknown_fields` (`status`, optional `action`,
    optional `reason`), then convert.
    Add one extra-key case per variant shape to `outcomes_are_maps_tagged_by_status` (`transport_tests.rs:174`).
- 5. Spec violation, Later: payload decode accepts shapes that sealing never writes.
  Decision: fix by item 1 (Open questions 3).
  - §Payloads (`PROTOCOL.md:158`): optional values are encoded as null, except a delete's `successor`, which is
    omitted when absent.
    §Sealing (`:201`): only algorithm deletes carry a `successor`.
  - Serde reads a missing `Option` field as `None`.
    The audit's probe: `cards.content` without `updated_at` decodes as `updated_at: None`.
  - `seal` refuses a successor on a non-algorithm delete (`payload.rs:418-423`), but `Payload::decode`
    (`payload.rs:359-410`) accepts one.
    The audit's probe: a card delete with `successor: "x"` decodes and passes it through.
    A `null` successor decodes as absent, a second encoding of the same delete (`payload.rs:166-170`).
  - The header and frame already refuse every encoding but their one (`envelope.rs:329-343`, `check_canonical`), since
    `sync-proto-audit` item 2; the payload decodes through plain `decode_cbor` (`envelope.rs:364-369`).
    So reordered payload keys, a longer integer form, and trailing bytes decode too.
  - `initial_product_ts` keys are not checked against the kind's groups (`payload.rs:22-23`).
    That is harmless, since apply reads only the registry's update groups.
  - Only devices decode payloads: apply (`crates/koloda/src/repo/sync/apply.rs:175`) and seal's own round trip
    (`payload.rs:453`).
    A delete or reset whose payload fails to decode still applies from its header (`apply.rs:181-184`); any other
    group holds its lane as corrupt.
  - The fixtures have not changed since they were added (`64c38681`), and no app has been released.
    So no stored envelope was written in another encoding.
- 10. Risk, Later: nothing in the proto suite pins registry classes or `contributes_updated_at`.
  Decision: fix by item 4.
  - §Groups, Class column (`PROTOCOL.md:259-280`); §`updated_at`, contributing groups (`:382-388`).
  - `rg -n 'Class|contributes_updated_at' crates/koloda-sync-proto/tests` finds nothing.
    Device apply branches on the class, and `refresh_updated_at` filters on `contributes_updated_at`.
    If `reviews.row` became `Class::Update`, no proto test would fail.
  - Fix direction: one table test in `registry_tests.rs` pinning each (kind, group)'s class and
    `contributes_updated_at` against literals copied from §Groups and §`updated_at`.
- 11. Risk, Later: fixture completeness is held by discipline.
  Decision: fix by item 4.
  - §Schema versions (`PROTOCOL.md:1800`): the fixtures pin the bytes of every group at its current schema.
  - The fixture and round-trip tests loop over `samples()` (`fixtures_tests.rs:45`, `payload_tests.rs:13`), not over
    the registry.
    So a new group with no sample has no fixture, and nothing fails.
    Today the sets agree: 28 samples, 24 groups plus 4 tombstoned kinds.
  - Fix direction: assert in `payload_tests.rs` that the sample names equal every registry `kind.group` plus one
    `kind.delete` per kind with tombstones, built from `Kind::ALL` and `spec()`.
- 12. Risk, Later: 2 of the 16 `ErrorCode` wire strings are tested.
  Decision: fix by item 5.
  - Only `unknown_space` (`transport_tests.rs:91`) and `epoch_changed` (`:143`) are pinned.
    The other 14 travel through `rename_all = "snake_case"` (`transport.rs:172-190`), so a variant rename changes the
    wire unnoticed.
  - The server pairs each code with its status by hand; every pair matches §Errors (`PROTOCOL.md:1000-1020`) today.
  - Fix direction: one table test of all 16 codes and their wire strings, both ways.
- 13. Risk, Later: nothing tests the envelope-level size cap one past, or the frame key list.
  Decision: fix by item 5.
  - `Envelope::decode` checks the total length first (`envelope.rs:137-141`), at `16_384 + 524_288 + 64` bytes.
    No test sends more.
  - The key-list INVARIANT (`envelope.rs:78`) is guarded for the header and `refs` only, by
    `a_known_key_with_a_wrong_type_stays_malformed` (`envelope_tests.rs:493`).
    If `FRAME_KEYS` (`envelope.rs:80`) lost `"payload"`, a wrong-typed `payload` would read as a newer writer.
  - Fix direction: a `16_384 + 524_288 + 65`-byte case expecting `TooLarge { part: Envelope }`, and a frame with a
    text `payload` that must stay `Malformed`.
- 14. Improvement, Later: the reply test's name claims a rule the type does not hold.
  Decision: fix by item 5.
  - `replies_carry_meta_and_exactly_one_of_ok_and_error` (`transport_tests.rs:67`) encodes one ok and one error
    reply.
    `Reply<T>` (`transport.rs:107-115`) decodes a reply with neither; the engine enforces exactly one
    (`crates/koloda-sync/src/client.rs:126-132`).
  - Fix direction: rename it to what it asserts, such as `replies_encode_meta_with_ok_or_error`.
- 15. Improvement, Later: leftover public surface.
  Decision: fix by item 6.
  - Each searched over `crates/` and `apps/electron/src-rust`, outside `crates/koloda-sync-proto/src`; none is found.
  - `RestoreMode::from_wire` (`transport.rs:383-387`) has no caller at all.
    The server compares stored text with `as_wire()`.
  - `TOKEN_HEX_LEN` (`transport.rs:19`), `Platform::ALL` (`:564`), `Group::ALL` (`registry.rs:240`), and
    `Hlc::counter` (`hlc.rs:58-61`) are public but used only inside the crate.
  - Fix direction: delete `RestoreMode::from_wire` and make the other four private
    (`agents/BACKWARDS-COMPATIBILITY.md`).
- 16. Product decision: an older app cannot read a newer server's new error code or outcome.
  Decision: decided, and moved to the task `sync-unknown-codes` (Open questions 2).
  - `ErrorCode`, `Outcome`, `HeldReason`, and `DependencyAction` have no catch-all (`transport.rs:171-357`).
    A reply with a new code fails to decode as a whole (`crates/koloda-sync/src/client.rs:205-207`).
    That is `SyncError::Transport`, which the status shows as a server out of reach
    (`crates/koloda-sync/src/status.rs:86`).
- R1. Docs gap: §Conformance cases has no entry for the three rules `sync-repo-followups` added.
  Decision: fix by item 7.
  - The rules: a bulk card delete pushes one cohort per 1,000 cards, and a capture refuses a cohort past one push's
    caps (§Cohorts); a space over quota gets no backfill or heal top-up (§Quotas, §Backfill); a learning value or
    default id this app's validation refuses holds its lane as corrupt (§Corrupt envelopes).
  - That task's plan did not name §Conformance cases (`PROTOCOL.md:1946`), so its Outcome left it.
- R2. Risk: a capture that replaces its own cohort's only outbox row deletes its own cohort row.
  Decision: fix by item 3.
  - `write_envelope` (`crates/koloda/src/repo/sync/capture.rs:138-158`) deletes the not-in-flight outbox row of the
    same (kind, id, group).
    It then calls `delete_empty_cohort` with that row's `commit_id` (`capture.rs:150`).
  - `EMPTY_COHORT` (`crates/koloda/src/repo/sync/mod.rs:532-535`) deletes the cohort when no outbox row names it.
    When the replaced row was this capture's only row, that is this capture's own cohort.
    `Capture::commit` inserted the cohort row once (`capture.rs:205-233`) and does not insert it again.
    So the new outbox row names a cohort that no longer exists.
  - Nothing enforces the link: `sync_cohorts` and `sync_outbox` have no foreign key (`V5__sync_capture.sql`).
  - A cohort-less row is never restamped (`restamp.rs:59` joins the cohorts).
    The `uncertain`, `fixed`, and `has_consumed` marks on its cohort update nothing (`outbox.rs:45`, `:76`, `:186`).
  - `sync-repo-followups` found no product path that writes one group twice in one capture, and neither did this check.

In:

- `koloda-sync-proto`: `Payload::decode` (`payload.rs`), `Outcome`'s decode (`transport.rs`), the leftover public
  items, and the protocol tests.
- `koloda`: `Capture::write_envelope` (`capture.rs`) and its integration test.
- `PROTOCOL.md`: §Payloads (item 1) and §Conformance cases (item 7).

Out:

- Finding 16, which is the task `sync-unknown-codes`.
  Its proposed design reads any undecodable sync reply as update required and changes no protocol type.
  Then neither task waits for the other; if it adds an unknown `Outcome` instead, it waits for item 2.
- The server: it never decodes payloads, and it already refuses a header it cannot read.
- Apply's classification of a payload that fails to decode, which stays as it is.

## Open questions

- [ ] 1. Flow? — proposed `local`, the default.
- [x] 2. Finding 16: should an unknown error code or outcome read as "update required", or may a server add one only
  once every device's app knows it? — read as update required (human, 2026-10-18).
  The engine stops with an update-required state the screens show.
  It crosses the engine, the desktop addon, the TS screens, i18n, and `SYNC.md`, so it is the task
  `sync-unknown-codes`.
  How the app tells such a reply is that task's Open questions 2.
- [ ] 3. How strict is payload decode (finding 5)? — proposed: one encoding, as the header and frame have.
  `Payload::decode` re-encodes what it decoded and refuses bytes that differ, as `check_canonical` does for the header
  and frame.
  That one check covers a missing optional key, an explicit `null` successor, reordered keys, a longer integer form,
  and trailing bytes.
  The successor rule is a check of its own, since a re-encode keeps a successor.
  Not proposed: the report's per-field `#[serde(deserialize_with = "Option::deserialize")]`.
  It catches a missing key only, and it leaves reordered keys and trailing bytes as second encodings.

## Plan

- [ ] 1. Refuse a payload in any encoding but the one sealing writes
  Goal (finding 5; per question 3):
  - `Payload::decode` (`payload.rs:359-410`) encodes the payload it decoded again and refuses input whose bytes
    differ, as `Header::decode` and `Envelope::decode` do (`check_canonical`, `envelope.rs:329-343`).
    The error is `NonCanonical`, under `PayloadError::Envelope`.
    That refuses a missing optional key, an explicit `null` successor, reordered keys, a longer integer or length
    form, and trailing bytes.
  - It refuses a successor on a delete of any kind but algorithms with `SuccessorNotAllowed`, as `seal` does
    (`payload.rs:418-423`).
  - Its WHY: one logical envelope has one digest, and an envelope sealing never writes is damaged or from a broken
    writer.
  - `PROTOCOL.md` §Payloads: one logical payload has one encoding, the one sealing writes.
    A payload in any other encoding, or a successor on a delete that is not an algorithm's, does not decode.
    A device holds such an update or create as corrupt, and still applies such a delete from its header
    (§Corrupt envelopes).
    The server never decodes a payload.
  Constraints:
  - `koloda-sync-proto` and `PROTOCOL.md` only.
    Apply's handling of a payload that fails to decode (`apply.rs:175-185`) does not change.
  - The fixtures do not change; regenerating them is a wire change (§Schema versions).
  Done when:
  - A table test in `payload_tests.rs` refuses, each with its exact error:
    a `cards.content` payload without `updated_at`; its keys reversed; it followed by one byte; an algorithm delete
    with `successor: null`; a card delete with a successor.
  - Every sample still decodes from its sealed bytes, and the fixture test passes unchanged.
  - Each case fails with the check removed, checked once by hand.
  - `cargo test -p koloda-sync-proto`, `cargo test -p koloda`, and `cargo test -p koloda-sync` pass, and
    `bun run check:push` is green.
  Manual verify: none — no writer produces such bytes; the tests arrange them.
  Commit: Refuse a payload in any encoding but the one sealing writes
  Depends on: none

- [ ] 2. Refuse unknown keys in push outcomes
  Goal (finding 4):
  - `Outcome` (`transport.rs:331-342`) decodes through a private wire struct with `deny_unknown_fields`: `status`,
    optional `action`, and optional `reason`.
    It then converts to the enum, refusing a missing or extra field for the status.
    Its encoding does not change.
  - Its WHY: serde's internally tagged enums ignore unknown keys, and `deny_unknown_fields` on the enum misses a unit
    variant with an extra key.
  Constraints:
  - `transport.rs` and `transport_tests.rs` only; §Bodies already says bodies reject unknown keys.
  - An unknown `status` stays a decode error; `sync-unknown-codes` decides what an app does with it.
  Done when:
  - `outcomes_are_maps_tagged_by_status` (`transport_tests.rs:174`) gains extra-key cases:
    `{status: applied, extra: 1}`, `{status: held, reason: quota, extra: 1}`, `{status: applied, reason: quota}`, and
    a `PushOutcome` and a `Receipt` whose `outcome` carries an extra key.
    Each fails to decode, and today's cases still pass.
  - `cargo test -p koloda-sync-proto`, `cargo test -p koloda-server`, and `cargo test -p koloda-sync` pass, and
    `bun run check:push` is green.
  Manual verify: none — the server never sends such an outcome; the tests arrange it.
  Commit: Refuse unknown keys in push outcomes
  Depends on: none

- [ ] 3. Keep a capture's own cohort when it rewrites a group
  Goal (R2):
  - `write_envelope` (`crates/koloda/src/repo/sync/capture.rs:138-158`) calls `delete_empty_cohort` only when the
    replaced row belongs to another commit.
    When it belongs to this capture's commit, the new row joins that cohort, so the cohort stays.
  - Its INVARIANT: every outbox row names a cohort row; restamp, the push marks, and the consumed mark read the cohort.
  Constraints:
  - `koloda` only.
    The other `delete_empty_cohort` callers (`apply.rs:812`, `:935`, `outbox.rs:636`) drop rows of other commits and
    stay as they are.
  Done when:
  - A test in `sync_integration_tests.rs`: on an enrolled database, one `Capture` writes `cards.content` of one card
    twice.
    It finds one outbox row, and a `sync_cohorts` row for its `commit_id` in state `local`.
  - The test fails against today's `capture.rs`, checked once by hand.
  - `cargo test -p koloda` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — no product path writes one group twice in one capture.
  Commit: Keep a capture's own cohort when it rewrites a group
  Depends on: none

- [ ] 4. Pin registry classes and sample coverage in the protocol tests
  Goal (findings 10 and 11):
  - A table test in `registry_tests.rs` pins each (kind, group)'s `class` and `contributes_updated_at`.
    The literals are copied from §Groups (Class column) and §`updated_at` (contributing groups), not read from
    `spec()`.
    The table covers every group the registry has, so a group added without a row fails.
  - A test in `payload_tests.rs` asserts that the sample names equal every registry `kind.group`, plus one
    `kind.delete` per kind with tombstones.
    The expected set is built from `Kind::ALL` and `spec()`, so a new group with no sample, and so no fixture, fails.
  Constraints:
  - Tests only; no registry or sample change.
  Done when:
  - Both tests pass.
    Each fails once by hand: with `reviews.row` made `Class::Update`, with one contribution flipped, and with one
    sample removed.
  - `cargo test -p koloda-sync-proto` passes, and `bun run check:push` is green.
  Manual verify: none — tests only.
  Commit: Pin registry classes and sample coverage in the protocol tests
  Depends on: none

- [ ] 5. Pin error codes, the envelope cap, and the frame keys in the protocol tests
  Goal (findings 12, 13, and 14):
  - A table test in `transport_tests.rs` pins all 16 `ErrorCode` variants against their wire strings, written as
    literals from §Errors, encoding and decoding each.
  - `envelope_tests.rs`: an envelope of `16_384 + 524_288 + 65` bytes fails with
    `TooLarge { part: Envelope, .. }`.
    Input of exactly `16_384 + 524_288 + 64` bytes fails with some other error, so the cap itself is allowed.
  - `a_known_key_with_a_wrong_type_stays_malformed` gains a frame whose `payload` is text, which stays
    `Malformed { part: Envelope, .. }`.
  - `replies_carry_meta_and_exactly_one_of_ok_and_error` is renamed to what it asserts, such as
    `replies_encode_meta_with_ok_or_error`.
  Constraints:
  - Tests only.
    The existing `unknown_space` and `epoch_changed` cases stay; they test the error body around the code.
  Done when:
  - Each new case fails once by hand: a renamed variant, the envelope cap raised by one, and `"payload"` dropped from
    `FRAME_KEYS`.
  - `cargo test -p koloda-sync-proto` passes, and `bun run check:push` is green.
  Manual verify: none — tests only.
  Commit: Pin error codes, the envelope cap, and the frame keys in the protocol tests
  Depends on: none

- [ ] 6. Trim the protocol crate's unused public surface
  Goal (finding 15):
  - Delete `RestoreMode::from_wire` (`transport.rs:383-387`), which has no caller.
  - Make `TOKEN_HEX_LEN` (`transport.rs:19`), `Platform::ALL` (`:564`), `Group::ALL` (`registry.rs:240`), and
    `Hlc::counter` (`hlc.rs:58-61`) private to the crate.
  Constraints:
  - `agents/BACKWARDS-COMPATIBILITY.md`: no shim or re-export.
  - Search `crates/`, `apps/electron/src-rust`, and the protocol tests again first; items 4 and 5 must not have added
    a use.
  Done when:
  - `cargo build --workspace --all-targets` and `cargo clippy` pass with no new warning.
  - `cargo test -p koloda-sync-proto` passes, and `bun run check:push` is green.
  Manual verify: none — no behavior change.
  Commit: Trim the protocol crate's unused public surface
  Depends on: 4, 5

- [ ] 7. List the bulk-delete, quota, and learning rules in the conformance cases
  Goal (R1):
  - `PROTOCOL.md` §Conformance cases (`:1946`) gains one entry per rule `sync-repo-followups` added:
    - a bulk delete of more than 1,000 cards pushes as several accepted cohorts, and a capture past one push's caps
      fails and writes nothing;
    - a space over quota during a backfill gets no backfill or heal batch, and the backfill resumes after the release;
    - a learning value or default id this app's validation refuses holds `hot` as corrupt, and the learning settings
      and today's totals still read.
  - Each entry names the case the way the list's other entries do, with its outcome in parentheses.
  Constraints:
  - Docs only; the tests for each rule exist since `sync-repo-followups`.
  Done when:
  - Each entry matches tests that exist:
    - `deleting_many_cards_writes_a_cohort_per_thousand_in_one_transaction` (`cards_sync_integration_tests.rs`), and
      the two `a_commit_past_the_push_*_cap_fails_and_leaves_nothing` tests (`sync_integration_tests.rs`);
    - `a_space_over_quota_takes_no_backfill_until_a_record_shows_room`
      (`crates/koloda-sync/tests/engine/holds_tests.rs`);
    - `a_learning_value_this_app_refuses_holds_and_the_document_still_reads` (`sync_holds_integration_tests.rs`).
  - `bun run check:push` is green.
  Manual verify: none — docs only.
  Commit: List the bulk-delete, quota, and learning rules in the conformance cases
  Depends on: none

## Outcome

<what shipped>
