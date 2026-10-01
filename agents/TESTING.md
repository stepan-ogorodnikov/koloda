# Testing Guide for AI Agents

This guide defines which tests to write when implementing a change.
It covers unit and integration tests across `libs/`, `apps/`, and `crates/koloda`.
The Playwright e2e suites are out of scope; they follow their own specs in `apps/web-e2e` and `apps/electron-e2e`.
The two suites deliberately mirror each other flow for flow; keep the platform transports separate, and push shared logic into `libs/e2e` only when drift between the copies starts costing.
Agents do not run them to prove a change; see `agents/VERIFY.md`.

## The survival question

Every test must survive one question: would it fail if the behavior were wrong, or only if the code changed?
A test that only detects change is noise.
That includes a test that only locks today's call shape, export list, or wiring.
Delete it, or do not add it.

Before writing the assertion, apply a plausible semantic bug to the implementation in your head.
Examples: an inverted comparison, a dropped guard, a rejected cancel.
If the planned test would still pass, redesign it before writing it.
When the answer is non-obvious, record it in the change description or task notes.

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
| Rust unit | Domain validation, serde wire contracts | `crates/koloda/tests/domain/<entity>_tests.rs` |
| Integration | Persistence constraints: FK, cascade, rollback, transactions, SQL semantics | `crates/koloda/tests/integration/<entity>_integration_tests.rs`, `libs/db-sqlite/src/lib/*.integration.test.ts` |
| E2e | User flows | `apps/web-e2e`, `apps/electron-e2e` |

- Every entity keeps at least one full-field roundtrip at the integration layer: write every column, read it back, compare field-by-field.
  This is the only check that catches SQL↔struct column-mapping drift — validators and unit tests never see it.
  Trimming CRUD permutations must never remove an entity's last roundtrip.
- Do not add a unit test that shadows a Playwright spec; the flow belongs to e2e.
- Rust file pairs follow `agents/RUST.md` (Entity CRUD notes).
  New files go under `tests/domain/` or `tests/integration/` and must be listed in `tests/domain/main.rs` or `tests/integration/main.rs`.

## One home per behavior

Each behavior has one home: the lowest unit layer that can see the failure.
That layer is a domain function, reducer, engine, or the equivalent.
Do not re-test the same rule through a higher door.
A reducer case re-checked via the store, a validator via the repo, or an engine race via React is a second door.
Add the higher door only when it owns behavior the lower test cannot observe.
Examples: an isolation or routing rule, or persistence-specific behavior in the repo.
If you add a second door, put one line of why above the test.
Use `// WHY: …` or a sentence in the `describe`.
The TS ↔ Rust twin rule is mirror coverage across languages.
It is not a license for three TypeScript homes.

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

Mirrored domain logic (`docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`) must carry the same boundary tests on both sides.
A rule tested in only one implementation will regress in the other.
When you add a boundary case in `libs/srs` or `libs/app`, add its twin in `crates/koloda`, and vice versa.

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
- Export and public-surface inventories.
  That includes `in` checks for method names, `Object.keys` of modules, and `typeof x === "function"` as the assertion.
- Counter tests, "starts at 0" checks, and getter round-trips.
  Exception: the atom or function owns non-obvious routing or isolation.
- Render-a-component-and-assert-it-rendered, or `toHaveProperty` presence loops.
- Self-fulfilling tests where the guard or orchestration logic lives inside the test itself.
- Mock-dominated tests: if the assertion re-observes what the mock fabricated, test the real unit or delete the test.

Bad (tests the language runtime):

```ts
it("sets name to AppError", () => {
  expect(new AppError("unknown").name).toBe("AppError");
});
```

Good (tests a decision the product made):

```rust
#[test]
fn null_total_limit_is_no_cap() {
    let limits = daily_limits(None, counted_limit(Some(10), true), counted_limit(Some(10), true), counted_limit(Some(10), true));
    let result = calculate_todays_review_totals(totals(5, 5, 5), limits);
    assert!(!result.meta.is_total_over_the_limit, "a null daily limit is no cap, not a hard zero");
}
```

## Delete when

When a change already edits a test file, or the code under test forces test updates, check that file.
Delete its tests that fail the survival question or match Banned patterns, in the same change.
Prefer deletion over skipping or weakening assertions.
If deletion is out of scope for that commit, report the test in the task notes or change description.
Never leave such a test unreported.
Do not expand the change into a whole-package or monorepo cleanup unless cleanup is the task.

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

Good suites demonstrate gated interleavings and tables.
Do not treat file length as a model to copy.

Match these files when the shape fits:

- `crates/koloda/tests/domain/reviews_totals_tests.rs` — boundary semantics for limit policy.
- `libs/assistant/src/lib/assistant-engine.test.ts` — gated-deferred interleavings for async coordination.
- `libs/assistant-react/src/lib/persistence/conversation-restore.test.ts` — wire-compat restore scenarios.
- `apps/electron/src/window-close-coordinator.test.ts` — state-machine race coverage.
- `libs/ai/src/lib/prompts.test.ts` — prose-prompt guards.
- `crates/koloda/tests/domain/reviews_validation_tests.rs` — shared-baseline reject/boundary tables asserting per-field error codes.
- `libs/assistant-react/src/lib/state/assistant-conversation-store.test.ts` — typed it.each negative-case table with per-row setup hooks.
- `crates/koloda/tests/domain/cards_serde_tests.rs` — NAPI wire pins: exact JSON shape, null-vs-omitted keys, serde round-trip.
- `libs/app/src/lib/error-parity.test.ts` — parses Rust `error_codes` from source vs `ERROR_MESSAGES` keys (`ai.*` TS-only allow-list).

## Running

Agents run scoped commands for touched packages only.
A full `bun run test:libs` is not required to justify a unit change.

- All TS lib tests: `bun run test:libs`.
- One TS lib: `bunx vitest run --config libs/<name>/vitest.config.mjs --configLoader runner [filter]`.
- Rust: `cargo test -p koloda`.
  Domain vs persistence: `cargo test -p koloda --test domain` / `--test integration`.
  The integration harness is self-contained (in-memory SQLite); no external services.

### Runner constraints

Lib Vitest configs use `pool: "threads"` and `maxWorkers: 2`.
All twelve lib test targets set `cache: true`.
`nx.json` `parallel` is `8`, so `test:libs` runs at most eight of those projects at once.
Root `.env` sets `NX_ISOLATE_PLUGINS=false`.
The file is committed, allowed by a `.gitignore` negation.

Ten of twelve libs set `isolate: false`, so their files share one worker's module registry.
A file-level `vi.mock(...)` there rewrites that import for the whole worker.
The rewrite is not undone when the file finishes, and `vi.restoreAllMocks()` does not clear it.
Whichever file runs first decides the module.
Vitest runs slower files first when `results.json` has timings, and larger files first on a cold cache (CI).
So a warm local run can pass while CI fails.
`--maxWorkers=1` puts every file of a project on one worker, which makes the leak deterministic.
Process singletons leak across files the same way; reset them in the test that depends on them.

`ui` and `srs-react` keep Vitest's default isolation.
A file-level mock there replaces a module that siblings import for real:

- `ui`: `query-error.test.tsx` mocks `@lingui/react`; siblings need the real catalog text.
- `srs-react`: `lesson-reducer.test.ts` mocks `@koloda/srs`; later files import the real module.

Other `isolate: false` libs file-mock `@lingui/react` too and pass, because no sibling imports it for real.
`db-sqlite` also sets `fileParallelism: false`.

Vitest config stays per package.
Do not introduce a shared Vitest defaults file.
The per-project differences are intentional, and setup files and `vi.restoreAllMocks()` habits differ too.

Under `isolate: false`, a module-level `vi.mock` of a package a sibling imports for real is a bug.
Fix it by removing or replacing the mock, not by flipping `isolate` alone.
Replacements already used:

- a real i18n catalog in `ui`
- real or injected `srs` in `srs-react`
- direct helper tests in `ai`
- a setup-file stub in `assistant-react`, installed before any test file imports the real module
