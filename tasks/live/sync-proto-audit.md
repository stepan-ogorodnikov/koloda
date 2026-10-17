# Sync protocol audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda-sync-proto/PROTOCOL.md, crates/koloda-sync-proto/README.md, crates/koloda/src/repo/sync/README.md, agents/RUST.md, crates/koloda-sync/README.md, agents/TESTING.md, agents/CODE-DOCUMENTATION.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the audit of the sync wire protocol (`crates/koloda-sync-proto`) at `9c4b5fa8` (`main`).
Its report was `tmp/audits/sync-proto.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.
The audit ran `cargo test -p koloda-sync-proto`: 30 passed and 1 was ignored by design (`write_envelope_fixtures`).
A throwaway probe binary outside the repo, linking the crate, confirmed the decode behavior of findings 1, 2, 4, 5,
and 14.
Its verdict: the crate matches `PROTOCOL.md` almost everywhere.
Every row of the §Groups and §Cascades tables, the §Payloads key table, the §Errors code set, every limit number, the
`koloda-schemas` rules, and pairing-code normalization match the code.
Sealing implements all four §Sealing steps, and the 28 fixtures cover every group and every delete.
No finding is Must-fix.

Done when:

- an older app that pulls a newer-schema envelope whose header its registry refuses reports `update_required`, not
  `corrupt_envelope`;
- a header or frame in any encoding but its one encoding fails to decode, and the server refuses its push;
- the engine's skew pause runs the protocol crate's rule, and a test pins it at exactly 5 minutes;
- tests pin the skew tolerance, the size limits, pairing-code normalization, and attachment-id uniqueness against
  literals or failing cases;
- §Bodies marks the three optional reply fields;
- `bun run check:push` is green.

## Scope

Findings, numbered as in the report.
Line numbers are at `9c4b5fa8`.

- 1. Spec violation, Should-fix: a header whose schema is above the app's own reads as corrupt when the newer schema
  changed its refs or parent.
  Decision: fixed by item 1.
  - §Corrupt envelopes (`PROTOCOL.md:1126-1127`): a schema above the app's own is `update_required`.
    §Schema versions (`:1780`): any payload-shape change bumps the schema.
    §Sealing (`:191-193`): refs and parent come from the payload, so a bump can change which refs a group carries or
    whether a kind has a parent.
  - `Header::decode` (`envelope.rs:156-162`) runs `validate()` (`envelope.rs:164-202`) on every decoded header.
    Nothing looks at `schema` until `Payload::decode` (`payload.rs:359-365`), which runs only after the header decoded.
  - Probe: a `schema: 2` `cards.content` header carrying `refs.template_id` decodes to
    `RefNotAllowed { Cards, TemplateId }`; the same header without `parent` decodes to `MissingParent { Cards }`.
  - The device classifier `unreadable` (`crates/koloda/src/repo/sync/apply.rs:205-216`) maps both to
    `CorruptEnvelope`.
  - Failure: if schema 2 lets deck notes link attachments, every older app holds `hot` as `corrupt_envelope`, and
    `cold` stops with it.
    The status invites an operator `drop-envelope` of a valid envelope.
    §Schema versions has a device return with an older app (`:1808`), and a client that meets an unknown
    `schema` reports `update_required` (`:1810-1812`).
- 2. Spec violation, Should-fix: the header and frame decoders accept a second encoding of one logical envelope.
  Decision: fixed by item 2.
  - §Envelope encoding (`PROTOCOL.md:120`): the header is a map "with these keys, in this order".
    `:138`: "One logical header has one encoding".
    `:117-118`: the header bytes reach the receiver unchanged and are the AEAD associated data; `:139`: the digest is
    over the encoded bytes.
  - `decode_cbor` (`envelope.rs:328-333`) calls `ciborium::from_reader`, which reads one value and ignores what follows.
    Serde's struct decode accepts keys in any order.
  - Probe: each of these decodes to the same `Header` or `Envelope` as the canonical bytes: the header keys reversed;
    the header followed by 3 trailing bytes; the frame followed by 1 trailing byte; `schema` as a 5-byte integer.
    Explicit `null`s and an empty `attachment_ids` array inside a non-empty `refs` decode as absent
    (`envelope.rs:114-123`) and take the same path.
  - The server stores pushed bytes as they arrive (`crates/koloda-server/src/push.rs:245-250`), so each variant is a
    distinct digest for one logical envelope.
    The engine already refuses trailing bytes after a reply (`crates/koloda-sync/src/client.rs:208-213`).
  - `round_trip_is_lossless_and_byte_stable` asserts "must have one encoding" (`envelope_tests.rs:103`) but feeds the
    decoder only canonical bytes.
  - No in-tree writer produces such bytes: `seal` and the device's restamp encode through this crate.
- 3. Spec violation (the spec contradicts the code), Should-fix: §Bodies does not mark three optional reply fields.
  Decision: fixed by item 5.
  - `DeviceInfo.last_sender_digest` and `revoked_at` are omitted when absent (`transport.rs:546-551`);
    `PROTOCOL.md:928` lists them as plain fields.
  - `PairingClaim.hint` is omitted when absent (`transport.rs:288-289`); `PROTOCOL.md:934` lists `hint` plainly.
  - Other optional fields in the table say so: the issue `hint` (`:932`), the attachment `width` and `height`
    (`:943-944`).
- 4. Spec violation, Later: `Outcome` accepts unknown keys.
  Decision: skipped as Later (Open questions 1).
  - §Bodies (`PROTOCOL.md:914`): bodies are CBOR maps that reject unknown keys.
  - `Outcome` is internally tagged without `deny_unknown_fields` (`transport.rs:332-342`).
    Probe: `{status: applied, extra: 1}`, `{status: held, reason: quota, extra: 1}`, and a `PushOutcome` and a
    `Receipt` whose `outcome` carries an extra key all decode.
  - `deny_unknown_fields` on the enum alone catches the struct variant but not a unit variant with an extra key.
  - Fix direction: decode `Outcome` through a private struct with `deny_unknown_fields` (`status`, optional `action`,
    optional `reason`), then convert; add one extra-key case per variant shape to `outcomes_are_maps_tagged_by_status`
    (`transport_tests.rs:174-227`).
- 5. Spec violation, Later: payload decode accepts shapes that sealing never writes.
  Decision: skipped as Later (Open questions 1).
  - §Payloads (`PROTOCOL.md:155`): optional values are encoded as null.
    §Sealing (`:198`): only algorithm deletes carry a `successor`.
  - Serde reads a missing `Option` field as `None`; probe: `cards.content` without `updated_at` decodes as
    `updated_at: None`.
  - `seal` refuses a successor on a non-algorithm delete (`payload.rs:419-423`), but `Payload::decode` accepts one
    (`payload.rs:368-371`); probe: a card delete with `successor: "x"` decodes and passes it through.
    A `null` successor decodes as absent, a second encoding of the same delete.
  - `initial_product_ts` keys are not checked against the kind's groups (`payload.rs:22-23`); harmless, since apply
    reads only the registry's update groups (`crates/koloda/src/repo/sync/mod.rs:380-384`).
  - Fix direction: mirror seal's successor rule in `Payload::decode`; require each optional key with
    `#[serde(deserialize_with = "Option::deserialize")]`; the fixtures do not change.
- 6. Risk, Should-fix: the skew pause the product runs is untested at its limit, and the tested function is dead.
  Decision: fixed by item 3.
  - §Skew guards (`PROTOCOL.md:611`): the client pauses "if skew exceeds 5 minutes either way"; the limit itself does
    not pause.
  - `is_skew_paused` (`hlc.rs:86-88`) has one caller, its own test (`hlc_tests.rs:87`).
    Search: `rg -n --type rust is_skew_paused crates apps/electron/src-rust` finds only `hlc.rs` and `hlc_tests.rs`.
  - The engine re-derives the rule as `skew_ms.unsigned_abs() > SKEW_TOLERANCE_MS`
    (`crates/koloda-sync/src/cycle.rs:375`), and its tests use only 6-minute skews
    (`crates/koloda-sync/tests/engine/clock_tests.rs:26`, `status_tests.rs:86`).
    A slip to `>=` there fails no test.
- 7. Risk, Should-fix: nothing tests pairing-code normalization where it lives, and nothing tests the `I`/`L` rule.
  Decision: fixed by item 4.
  - §Pairing (`PROTOCOL.md:1647`): case, spaces, and hyphens do not matter, and `O`, `I`, and `L` read as `0`, `1`,
    and `1`.
  - `code_hash` (`transport.rs:33-45`) is never called in `tests/protocol/`; `rg -n code_hash
    crates/koloda-sync-proto/tests` finds nothing.
  - The server suite types one code in lowercase with `o` for `0` and one hyphen
    (`crates/koloda-server/tests/server/pairing_tests.rs:188-196`); the engine suite types one in lowercase with a
    hyphen (`crates/koloda-sync/tests/engine/pairing_tests.rs:358-361`).
    Dropping the `'I' | 'L' => '1'` arm or the whitespace filter fails no test.
- 8. Risk, Should-fix: nothing tests that attachment ids are unique.
  Decision: fixed by item 2, which tests the rest of the one-encoding rule.
  - §Envelope encoding (`PROTOCOL.md:138`): `attachment_ids` are sorted and unique.
  - `validate` refuses a pair unless `a < b` (`envelope.rs:191-200`); the only table case is the unsorted pair
    `["bb", "aa"]` (`envelope_tests.rs:241-256`).
    Sealing removes duplicates before validation (`payload.rs:479-480`), so no sample carries one.
    A slip to `a <= b` fails no test.
- 9. Risk, Should-fix: the protocol's numbers are asserted only through the constants that hold them.
  Decision: fixed by items 3 (the skew pause) and 4 (the rest).
  - Ruling 23 (`PROTOCOL.md:1881`) sets the skew tolerance at 5 minutes; §Envelope encoding (`:148`) sets 16 KiB and
    512 KiB.
    The server and the app deploy separately, so these numbers are a contract between versions.
  - `client_pauses_only_when_skew_exceeds_five_minutes` and `server_rejects_a_wall_part_more_than_five_minutes_ahead`
    (`hlc_tests.rs:77-105`) build every boundary from `SKEW_TOLERANCE_MS`.
    `decode_enforces_size_limits_at_the_limit_and_one_past` (`envelope_tests.rs:116-165`) builds its boundaries from
    `MAX_HEADER_BYTES` and `MAX_PAYLOAD_BYTES`.
  - If `hlc.rs:10` read 10 minutes, every test would pass, and the error text at `hlc.rs:108`, which hardcodes
    "5 minutes", would be wrong.
  - `agents/TESTING.md`: pin a wire contract against a literal written in the test, not the same constant.
- 10. Risk, Later: nothing in the proto suite pins registry classes or `contributes_updated_at`.
  Decision: skipped as Later (Open questions 1).
  - §Groups Class column (`PROTOCOL.md:256-279`), §Classes (`:295-305`).
  - `rg -n 'Class|contributes_updated_at' crates/koloda-sync-proto/tests` finds nothing.
    Device apply branches on the class (`crates/koloda/src/repo/sync/mod.rs:381`), and `refresh_updated_at` filters on
    `contributes_updated_at` (`apply.rs:1003`).
    If `reviews.row` became `Class::Update`, no proto test would fail.
  - Fix direction: one table test in `registry_tests.rs` pinning each (kind, group)'s class and
    `contributes_updated_at` against literals copied from §Groups.
- 11. Risk, Later: fixture completeness is held by discipline.
  Decision: skipped as Later (Open questions 1).
  - §Schema versions (`PROTOCOL.md:1783`): the fixtures pin the bytes of every group at its current schema.
  - The fixture and round-trip tests loop over `samples()` (`fixtures_tests.rs:45`, `payload_tests.rs:13`), not over
    the registry, so a new group with no sample has no fixture and nothing fails.
    Today the sets agree: 28 samples, 24 groups plus 4 tombstoned kinds.
  - Fix direction: assert in `payload_tests.rs` that the sample names equal every registry `kind.group` plus one
    `kind.delete` per kind with tombstones, built from `Kind::ALL` and `spec()`.
- 12. Risk, Later: 2 of the 16 `ErrorCode` wire strings are tested.
  Decision: skipped as Later (Open questions 1).
  - Only `unknown_space` (`transport_tests.rs:133`) and `epoch_changed` (`:161`) are pinned; the other 14 travel
    through `rename_all = "snake_case"` (`transport.rs:171-173`), so a variant rename changes the wire unnoticed.
  - The server pairs each code with its status by hand at 21 call sites; all 21 match §Errors today.
  - Fix direction: a table test of all 16 codes and their wire strings.
- 13. Risk, Later: nothing tests the envelope-level size cap one past, or the frame key list.
  Decision: skipped as Later (Open questions 1).
  - `Envelope::decode` checks the total length first (`envelope.rs:135-139`); no test sends more than
    `16 KiB + 512 KiB + 64` bytes.
  - The key-list INVARIANT (`envelope.rs:76-78`) is guarded for the header and `refs` only
    (`envelope_tests.rs:351-381`); if `FRAME_KEYS` lost `"payload"`, a wrong-typed `payload` would read as a newer
    writer.
  - Fix direction: a `16_384 + 524_288 + 65`-byte case expecting `TooLarge { part: Envelope }`, and a frame case with
    a text `payload` in `a_known_key_with_a_wrong_type_stays_malformed`.
- 14. Improvement, Later: the reply test's name claims a rule the type does not hold.
  Decision: skipped as Later (Open questions 1).
  - `replies_carry_meta_and_exactly_one_of_ok_and_error` (`transport_tests.rs:67`) encodes one ok and one error reply.
    `Reply<T>` (`transport.rs:107-115`) decodes a reply with neither (probe); the engine enforces exactly one
    (`crates/koloda-sync/src/client.rs:126-132`).
  - Fix direction: rename it to what it asserts, such as `replies_encode_meta_with_ok_or_error`.
- 15. Improvement, Later: leftover public surface.
  Decision: skipped as Later (Open questions 1); item 3 settles `is_skew_paused`.
  - Searched each over `crates/` and `apps/electron/src-rust`, outside `crates/koloda-sync-proto/src`:
    `RestoreMode::from_wire`, `TOKEN_HEX_LEN`, `Platform::ALL`, `Group::ALL`, and `\.counter\(\)` find nothing.
  - `RestoreMode::from_wire` (`transport.rs:383-387`) has no caller; the server compares stored text with `as_wire()`
    (`crates/koloda-server/src/restore.rs:196-205`).
    `TOKEN_HEX_LEN` (`transport.rs:19`), `Platform::ALL` (`:562`), `Group::ALL` (`registry.rs:240`), and
    `Hlc::counter` (`hlc.rs:58-61`) are public but used only inside the crate.
  - Fix direction: delete `RestoreMode::from_wire` and make the other four private
    (`agents/BACKWARDS-COMPATIBILITY.md`).
- 16. Product decision, Later: an older app cannot read a newer server's new error code or outcome.
  Decision: needs-decision, not scheduled (Open questions 3).
  - `ErrorCode`, `Outcome`, `HeldReason`, and `DependencyAction` have no catch-all (`transport.rs:171-190`,
    `332-357`).
    A new code or held reason makes every older app fail to decode the whole reply, as "a … reply is not a sync reply"
    (`crates/koloda-sync/src/client.rs:206-207`), rather than reach an update-required state.
  - The protocol states a forward rule only for `koloda-schemas` (`PROTOCOL.md:1796`); §Errors and §Push outcomes say
    nothing about older apps.

In:

- `koloda-sync-proto`: `Header::decode` and `Envelope::decode` (`envelope.rs`), `is_skew_paused` and the
  `TooFarAhead` message (`hlc.rs`), and the protocol tests.
- The device classifier `unreadable` (`crates/koloda/src/repo/sync/apply.rs`) and its hold table test (item 1).
- The engine's `check_skew` (`crates/koloda-sync/src/cycle.rs`) (item 3).
- `PROTOCOL.md`: §Envelope encoding, §Corrupt envelopes, and §Bodies, each with the item that makes it true.

Out:

- Findings 4, 5, and 10 to 15, as Later (Open questions 1).
- Finding 16 until it is decided (Open questions 3).
- Canonical payload bytes: payload decode leniency is finding 5.
- The server: it already refuses every header decode error as `bad_request`, so items 1 and 2 change only its message.

## Open questions

- [x] 1. Triage? — as proposed (human, 2026-10-17).
  Fix the Should-fix findings 1, 2, 3, 6, 7, 8, and 9; 4, 5, and 10 to 15 stay Later and are not scheduled; 16 waits
  on question 3.
  The Later findings are each XS or S and need no decision, so a later task can take 10 to 15 (tests and dead
  surface) and 4 and 5 (decode strictness).
- [x] 2. Where does the newer-schema check go (item 1)? — as proposed (human, 2026-10-17).
  `Header::decode` relabels a `validate()` failure as `NewerSchema` only when `schema` is above `SCHEMA`.
  Checking the schema before validating would also refuse a valid newer-schema header at decode.
  The server decodes pushes with this crate, so an older server would answer a newer app's raised schema with
  `bad_request` instead of `held { schema }` or `schema_read_only` (§Schema versions).
- [ ] 3. Finding 16: should an unknown error code or outcome read as "update required", or may a server add one only
  once every device's app knows it? — open; left unscheduled here (human, 2026-10-17).
  The first is an engine change in reply decoding; the second needs a way to know the devices' apps beyond
  `koloda-schemas`.
  Either answer goes in §Errors and §Push outcomes.
- [x] 4. Flow? — `local` (human, 2026-10-17).

## Plan

- [x] 1. Ask for an update when a newer-schema header breaks this app's registry
  Goal (finding 1):
  - Add `EnvelopeError::NewerSchema { kind, schema }` (`envelope.rs`), shown as the kind's schema being newer than
    this app's `payload::SCHEMA`.
  - `Header::decode` (`envelope.rs:156-162`) returns it in place of the `validate()` error when the header's
    `schema` is above `SCHEMA`.
    A header at or below `SCHEMA` keeps its registry error, and a newer-schema header that validates still decodes,
    so `Payload::decode` reports `UnknownSchema` as today.
    `validate()` itself, which `Header::encode` also runs, does not change.
  - WHY comment there: a newer schema may change a group's refs or a kind's parent (§Schema versions, §Sealing), so
    this app's registry cannot judge that header.
  - `unreadable` (`crates/koloda/src/repo/sync/apply.rs:205-216`) maps `NewerSchema` to `UpdateRequired`; its WHY
    comment names a schema above the app's own beside unknown vocabulary and keys.
  - `PROTOCOL.md` §Corrupt envelopes (lines 1125-1127): a header above the app's schema that breaks this app's header
    rules, such as a ref its group lacks, is `update_required` too.
  Constraints:
  - `envelope.rs`, `apply.rs`, their tests, and `PROTOCOL.md` only; no engine or server change.
  - The server still refuses such a push as `bad_request` (`push.rs:245-246`).
  Done when:
  - `decode_rejects_headers_that_do_not_parse_or_validate` (`envelope_tests.rs:269-299`) gains three cases: a
    `cards.content` header at `SCHEMA + 1` with `refs.template_id` and one without `parent`, each `NewerSchema`;
    the same ref at `SCHEMA` stays `RefNotAllowed`.
  - `an_unreadable_hot_entry_reports_why` (`crates/koloda/tests/integration/sync_holds_integration_tests.rs:456`)
    gains a case: a header at `SCHEMA + 1` carrying a ref its group lacks holds as `UpdateRequired`.
  - Both new failing cases fail against today's code, checked once by hand.
  - `cargo test -p koloda-sync-proto -p koloda -p koloda-server` passes, and `bun run check:push` is green.
  Manual verify: none — a newer-schema writer exists only in the tests.
  Commit: Ask for an update when a newer-schema header breaks this app's registry
  Depends on: none

- [ ] 2. Refuse a second encoding of an envelope's header or frame
  Goal (findings 2 and 8):
  - `Header::decode` (`envelope.rs:156-162`), after `validate()`, re-encodes the decoded header and refuses input
    whose bytes differ as `NonCanonical`.
    That one comparison covers key order, trailing bytes, longer integer and length forms, explicit `null`s, and an
    empty `attachment_ids` inside `refs`.
  - `Envelope::decode` (`envelope.rs:134-146`) does the same for the frame before it decodes the header.
  - `PROTOCOL.md` §Envelope encoding (line 138): a decoder refuses a header or frame in any other encoding, so the
    server refuses its push as `bad_request` and a client that pulls one holds it as corrupt (§Corrupt envelopes).
  Constraints:
  - `envelope.rs`, `envelope_tests.rs`, and `PROTOCOL.md` only.
  - Payload bytes are out (finding 5); the fixtures do not change.
  - Test helpers elsewhere that rebuild a header through `ciborium::Value` keep its key order; if one does not, fix
    the helper, not the rule.
  Done when:
  - `decode_rejects_headers_that_do_not_parse_or_validate` gains `NonCanonical` cases: the keys reversed, 3 trailing
    bytes, `schema` as a 5-byte integer, an explicit `null` ref inside `refs`, and an empty `attachment_ids` beside a
    ref.
  - A frame table next to it: the frame's keys reversed and 1 trailing byte, each `NonCanonical`.
  - `header_validation_follows_the_registry` (`envelope_tests.rs:174-266`) gains `["aa", "aa"]`, expecting
    `NonCanonical` (finding 8).
  - The new decode cases fail against today's `envelope.rs`, checked once by hand.
  - `cargo test -p koloda-sync-proto -p koloda-sync -p koloda-server -p koloda` passes, and `bun run check:push` is
    green.
  Manual verify: none — no in-tree writer produces a second encoding.
  Commit: Refuse a second encoding of an envelope's header or frame
  Depends on: none

- [ ] 3. Pause the engine on skew through the protocol crate's rule
  Goal (finding 6, and finding 9 for the pause):
  - `is_skew_paused` (`hlc.rs:86-88`) takes the skew estimate, server time minus local time in milliseconds as an
    `i64` (§Skew guards), and is true when its magnitude exceeds `SKEW_TOLERANCE_MS`.
  - `check_skew` (`crates/koloda-sync/src/cycle.rs:373-379`) calls it; its INVARIANT comment stays.
  - `client_pauses_only_when_skew_exceeds_five_minutes` (`hlc_tests.rs:77-89`) tests the new signature against
    literals: `0`, `300_000`, and `-300_000` do not pause; `300_001` and `-300_001` do.
  Constraints:
  - `hlc.rs`, `cycle.rs`, and `hlc_tests.rs` only; no shim for the old signature (`agents/BACKWARDS-COMPATIBILITY.md`).
  Done when:
  - `rg -n --type rust is_skew_paused crates apps/electron/src-rust` lists `hlc.rs`, `hlc_tests.rs`, and `cycle.rs`.
  - Changing `>` to `>=` in `is_skew_paused` fails the table, checked once by hand.
  - `cargo test -p koloda-sync-proto -p koloda-sync` passes, and `bun run check:push` is green.
  Manual verify: none — the engine's skew tests cover the pause.
  Commit: Pause the engine on skew through the protocol crate's rule
  Depends on: none

- [ ] 4. Pin the protocol's numbers and pairing-code normalization in tests
  Goal (findings 7 and 9):
  - `server_rejects_a_wall_part_more_than_five_minutes_ahead` (`hlc_tests.rs:91-105`) writes its boundaries as
    `server_now + 300_000` and `+ 300_001`.
  - `decode_enforces_size_limits_at_the_limit_and_one_past` (`envelope_tests.rs:116-165`) writes its limits as
    `16_384` and `524_288`.
  - The `TooFarAhead` message (`hlc.rs:108`) is formatted from `SKEW_TOLERANCE_MS` instead of the text "5 minutes".
  - A table test in `transport_tests.rs`: each typed form of one valid code hashes like the canonical code with
    `code_hash` (`transport.rs:33-45`).
    Forms: lowercase, spaces, hyphens, `O` and `o` for `0`, and `I`, `i`, `L`, and `l` for `1`.
    A code that differs by one character hashes differently.
  Constraints:
  - Tests and the `hlc.rs` message only.
  Done when:
  - Changing `SKEW_TOLERANCE_MS`, `MAX_HEADER_BYTES`, or `MAX_PAYLOAD_BYTES` fails a test, and dropping the
    `'I' | 'L'` arm or the whitespace filter in `code_hash` fails the table, each checked once by hand.
  - `cargo test -p koloda-sync-proto` passes, and `bun run check:push` is green.
  Manual verify: none — tests only.
  Commit: Pin the protocol's numbers and pairing-code normalization in tests
  Depends on: 3

- [ ] 5. Mark the optional reply fields in §Bodies
  Goal (finding 3):
  - `PROTOCOL.md:928`: the device record carries `last_sender_digest` and `revoked_at` only when set.
  - `PROTOCOL.md:934`: the claim returns `hint` only when the code carries one.
  Constraints: docs only, `PROTOCOL.md`.
  Done when: `bun run check:push` is green.
  Manual verify: none — docs only.
  Commit: Mark the optional reply fields in §Bodies
  Depends on: none

## Outcome

<what shipped>
