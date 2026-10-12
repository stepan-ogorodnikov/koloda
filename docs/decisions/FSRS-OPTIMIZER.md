# FSRS Optimizer

## Ruling

- Fitting FSRS weights to review history runs in Rust, in `koloda` on the desktop, through the `fsrs` crate.
- Scheduling stays in TypeScript (`@koloda/srs` over ts-fsrs), as `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` says.
  The optimizer never schedules cards and never rewrites card or review rows.
- The only handoff between the two is an algorithm's weights string.
  It holds exactly `FSRS6_WEIGHT_COUNT` numbers, the model ts-fsrs schedules with.
- The crate is pinned to an exact version, because a bump can change the fitted weights or the model it trains.
  A bump must keep training FSRS-6 until the scheduler moves.
- Days between reviews are counted the way ts-fsrs counts elapsed days: differences of UTC calendar dates.
  They are not counted by the learning day (`dayStartsAt`).
- Moving to another FSRS model is one change across the crate pin, ts-fsrs, the weight count on both sides,
  and the stored algorithms.
- The optimizer has no TypeScript twin.
  The web demo offers no optimization (`docs/decisions/APP-ROLES.md`).

## Why

The reviews live in the SQLite database Rust owns on the desktop, and the `fsrs` crate is the reference optimizer.
Running it there keeps review history off IPC.
The fitted weights only predict well if training sees days the way the scheduler does,
so the two must change together.

## Applies when

- A change touches `crates/koloda/src/domain/optimizer.rs`, `crates/koloda/src/repo/optimizer.rs`,
  or the desktop commands that run them.
- A change bumps the `fsrs` crate or ts-fsrs, or changes how ts-fsrs counts elapsed days.
- A change touches the FSRS weight count or format on either side.

Scheduling changes that keep the weight count and the day count do not need this file.
