# Conformance goldens

Shared fixtures that Rust (`koloda-core`) and TypeScript must both satisfy.
A behavioral change on only one backend must fail.

See [ADR 0001](../docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md) for why the two implementations exist.
See `agents/TESTING.md` for when a case belongs here instead of a hand-written twin.

## What belongs here

Pure mirrored domain rules: the same input must produce the same output or the same error code on both backends.
Database behavior, IPC, FSRS scheduling, and UI flows stay in their existing test layers.

## Case shape

Plain JSON only (no JSONC).
One concern per file.

Each case has `name`, `input`, and exactly one of `output` or `error`.
Loaders must reject a case that has both or neither.
Failures must include the case `name`.

`schemaVersion` must be `1`.

Golden outputs use epoch milliseconds for timestamps.
Expected failures use stable error codes, never localized messages.

Do not generate expected values from either implementation.

## Files

- `day-starts-at.json` — clock-string parse for `dayStartsAt`
- `learning-day.utc.json` — learning-day `[from, to)` windows with `"timeZone": "UTC"`

Learning-day files require a file-level `timeZone`.
Parser files do not.

## `now` parsing

Used by learning-day fixtures.

No offset (`2024-01-02T04:30:00`) is naive local time in the file's `timeZone`.
If that civil time is ambiguous, use the earlier occurrence (the JavaScript default).
A trailing `Z` (`2024-11-03T06:30:00.000Z`) is an absolute instant.
Adapters convert that instant into the file's `timeZone`.

## How to add a case

1. Add a row to the matching JSON file, or add a new file if this is a new concern.
2. Give it a unique `name`.
3. Put arguments in `input`.
4. Put expected success data in `output`, or a stable error code in `error`, not both.
5. Compute timestamp millis from civil time plus the IANA offset, not by printing Koloda code.
6. Run both language adapters for that file.

Keep colocated unit tests for details goldens do not encode: Zod/serde defaults, wrappers, fake-timer current-time paths.
