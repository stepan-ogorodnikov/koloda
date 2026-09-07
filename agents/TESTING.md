# Testing Guide for AI Agents

This guide defines which tests to write when implementing a change.
It covers unit and integration tests across `libs/`, `apps/`, and `crates/koloda-core`.
The Playwright e2e suites are out of scope; they follow their own specs in `apps/demo-e2e` and `apps/native-electron-e2e`.

## The survival question

Every test must survive one question: would it fail if the behavior were wrong, or only if the code changed?
A test that only detects change is noise.
Write each test so a plausible semantic bug — an inverted comparison, a dropped guard, a rejected cancel — makes it fail.
Before writing the assertion, mentally apply such a mutation to the implementation and check the planned test would fail.
If it would still pass, redesign the test before writing it.

## When tests are required

- Any behavior change to domain rules, repo SQL, settings validation, async coordination, or wire formats.
- Bug fixes: add the failing case, ideally before the fix.
- When a change invalidates an existing test, update the test in the same change.
  Tests are the executable spec; a stale test is worse than a missing one.
- Pure wiring — barrel exports, prop threading, route registration — needs no tests.

## Layers and what each owns

| Layer | Owns | Location |
| --- | --- | --- |
| TS unit | Domain rules, boundary semantics, state transitions, async coordination | Colocated `*.test.ts(x)` |
| Rust unit | Domain validation, serde wire contracts | `crates/koloda-core/tests/domain/<entity>_tests.rs` |
| Integration | Persistence constraints: FK, cascade, rollback, transactions, SQL semantics | `crates/koloda-core/tests/integration/<entity>_integration_tests.rs`, `libs/db-pglite/src/lib/*.integration.test.ts` |
| E2e | User flows | `apps/demo-e2e`, `apps/native-electron-e2e` |

- Every rule has exactly one test home per implementation; the TS ↔ Rust twins required below are mirror coverage, not duplicates.
- Do not re-test a validator through the repo layer unless the repo adds persistence-specific behavior.
- Every entity keeps at least one full-field roundtrip at the integration layer: write every column, read it back, compare field-by-field.
  This is the only check that catches SQL↔struct column-mapping drift — validators and unit tests never see it.
  Trimming CRUD permutations must never remove an entity's last roundtrip.
- Do not add a unit test that shadows a Playwright spec; the flow belongs to e2e.
- Rust file pairs follow `agents/CORE-CRATE.md` (Entity CRUD notes).
  New files go under `tests/domain/` or `tests/integration/` and must be listed in `tests/domain/main.rs` or `tests/integration/main.rs`.

## Write tests for

- Threshold rules: test at the limit and one past it.
- Zero semantics: zero meaning "no cap" or "no filter" is a product decision, not a degenerate case.
- Both sides of time boundaries, e.g. the learning-day rollover before and after the boundary hour.
- Error paths: assert the exact error code and set the triggering condition in the fixture.
- Async coordination: races, cancellation, close, idempotency.
- Wire formats: serde JSON shapes, persistence schema versions, legacy rows loading after migration.
- Scheduling math: pin concrete intervals and states for boundary ratings, not object shape.

Async tests must assert real interleavings.
Use gated promises (TS) or barriers (Rust) so the ordering under test is forced, not accidental.
A happy-path-only test of concurrent code protects nothing.

Do not order events with wall-clock time: no sleeps, no busy-waits such as `while (Date.now() === t)`.
Use fake timers for anything time-based and gated promises for ordering.
An intermittent failure is a bug — fix it before merging rather than retrying.

## The TS ↔ Rust twin rule

Mirrored domain logic (`docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`) must carry the same boundary tests on both sides.
A rule tested in only one implementation will regress in the other.
When you add a boundary case in `libs/srs` or `libs/app`, add its twin in `crates/koloda-core`, and vice versa.

## Banned patterns

Do not write:

- Constructor, getter, setter, or `instanceof` tests.
  The language runtime is not under test.
- Serde batteries: per-field × (missing, extra, wrong-type, null) on plain DTOs.
  Write one table-driven test per DTO instead.
- Passthrough assertions: a function returning its input unchanged.
- Constants or defaults asserted to equal themselves.
  Exception: a persisted default is a wire contract. Pin it against a literal written in the test when stored rows or payloads depend on it staying stable — do not "pin" it by importing and comparing the same constant.
- Full prompt-string equality.
  Use phrase presence plus negative guards; see `libs/ai/src/lib/prompts.test.ts`.
- API-surface assertions such as `Object.keys` of an export.
- Render-a-component-and-assert-it-rendered, or `toHaveProperty` presence loops.
- Self-fulfilling tests where the guard or orchestration logic lives inside the test itself.
- Mock-dominated tests: if the assertion re-observes what the mock fabricated, test the real unit or delete the test.
- Re-runs of a sibling test through another door: a reducer re-tested through the store, a validator re-tested through the repo.

When you find a banned pattern in a file you are touching anyway, leave it and report it — in the change description or task notes.
Do not expand a change into suite cleanup unless cleanup is the task: unreported violations rot silently, unrequested deletions surprise reviewers.

Bad (tests the language runtime):

```ts
it("sets name to AppError", () => {
  expect(new AppError("unknown").name).toBe("AppError");
});
```

Good (tests a decision the product made):

```rust
#[test]
fn zero_total_limit_is_no_cap() {
    let limits = daily_limits(0, counted_limit(10, true), counted_limit(10, true), counted_limit(10, true));
    let result = calculate_todays_review_totals(totals(5, 5, 5), limits);
    assert!(!result.meta.is_total_over_the_limit, "a daily limit of zero is no cap, not a hard zero");
}
```

## Coverage

Coverage percentage is not tracked and is not a goal.
Execution coverage cannot see assertion quality: a suite can be near-full coverage of tests that protect nothing.

Completeness comes from the write-tests-for checklist plus the twin rule:
enumerate the rule's thresholds and error codes, then confirm each has a test home.
After a change, verify every new branch and error path is exercised by a named test.

If you want a mechanical omission check, run coverage scoped to the files you
just touched as a one-off (`vitest run --coverage` filtered to those files).
Treat the result as a hint that a line was never executed — never as a number
to record, gate on, or raise.

## Repetition and tables

When a matrix is real — every enum value, every error code — write one table-driven test, not one test per cell.
If a file's tests differ only by a cosmetic input, collapse them.
Name test files after what they actually test: serde shape tests do not belong in `*_validation_tests.rs`.
A test's name must describe its assertion: if the body does not verify what the name claims, fix whichever is wrong.

When replacing existing tests with a table-driven version, write the replacement and delete the replaced tests in the same change.
Deleting first leaves a coverage hole if the replacement stalls; keeping both recreates the per-cell noise banned above.
Coverage must never dip between two commits.

## Exemplars

Match these files when the shape fits:

- `crates/koloda-core/tests/domain/reviews_totals_tests.rs` — boundary semantics for limit policy.
- `libs/assistant/src/lib/assistant-engine.test.ts` — gated-deferred interleavings for async coordination.
- `libs/srs-react/src/lib/assistant/persistence/conversation-restore.test.ts` — wire-compat restore scenarios.
- `apps/native-electron/src/window-close-coordinator.test.ts` — state-machine race coverage.
- `libs/ai/src/lib/prompts.test.ts` — prose-prompt guards.
- `crates/koloda-core/tests/domain/lessons_validation_tests.rs` — shared-baseline reject/boundary tables asserting per-field error codes.
- `libs/srs-react/src/lib/assistant/state/assistant-conversation-store.test.ts` — typed it.each negative-case table with per-row setup hooks.
- `crates/koloda-core/tests/domain/cards_serde_tests.rs` — NAPI wire pins: exact JSON shape, null-vs-omitted keys, serde round-trip.
- `libs/app/src/lib/error-parity.test.ts` — parses Rust `error_codes` from source vs `ERROR_MESSAGES` keys (`ai.*` TS-only allow-list).

## Running

- All TS lib tests: `bun run test:libs`.
- One TS lib: `bunx vitest run --config libs/<name>/vitest.config.mjs --configLoader runner [filter]`.
- Rust: `cargo test -p koloda-core`.
  Domain vs persistence: `cargo test -p koloda-core --test domain` / `--test integration`.
  The integration harness is self-contained (in-memory SQLite); no external services.
