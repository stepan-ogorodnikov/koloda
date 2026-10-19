# CI audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: remote

## Intent

Settle every finding of the CI audit dated 2026-10-18.
It covered `.github/workflows/ci.yml`, `.github/workflows/docker.yml`, `tools/check-push.ts`, and the `check:*`
scripts.
None of them changed between the audit and `754b057d`, where this task branches.
Its report was `tmp/audits/ci.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.
Each finding was checked again at `754b057d` against the workflows, the Actions cache list, and three run logs.
Three of the report's claims are corrected below, and triage found finding 7.

The report's verdict: a CI run takes about 6.5 minutes, against 2.5–4 in early October.
Every run starts with empty caches, and the Rust track rebuilds its dependencies from scratch.

| Date | Run | Branch | Total | Check push | Cargo cache |
| --- | --- | --- | --- | --- | --- |
| 2026-10-09 | 37901841141 | — | ~2.5m | 86s | hit (1.57 GB), 45s restore |
| 2026-10-14 | 38540390642 | — | ~4m | 198s | miss |
| 2026-10-18 | 39124718097 | `task/sync-unknown-codes` | 6m27s | 339s | miss |
| 2026-10-19 | 39214683028 | `task/koloda-audit` | 6m36s | 341s | miss |

In run 39124718097 the rust track took 5m39s and was the critical path.
Workspace clippy alone compiled 255 units in 2m45s.
The ts track took 2m51s: `tsc -b` 52s and the lib tests 97s.

Done when:

- CI runs on pushes to `main` and saves the Cargo, Nx, and dprint caches there;
- a task branch run restores them and saves none of its own;
- the Cargo cache holds dependencies only;
- a restored Nx cache is usable on another runner;
- the Bun install cache is gone;
- one clippy target lints the whole Rust workspace;
- the Docker workflow saves no layer cache;
- `bun run check:push` and the CI job `checks` are green on the tip.

To check after landing (not part of the gate, so Outcome cannot record it):

- the first `main` run saves `v0-rust-…`, `nx-Linux-…`, and `dprint-…` entries on `refs/heads/main`;
- the next task branch run restores them;
  its Nx summaries show hits for unchanged projects, and its cargo output compiles only workspace crates;
- that run's timing decides finding 3.

## Scope

Findings, numbered as in the report; 7 is new.
Line numbers are at `754b057d`.

- 1. Bottleneck, High: every CI cache misses, because Actions caches are branch-scoped and CI skips `main`.
  Decision: fixed by item 1 (Cargo, dprint) and item 2 (Nx).
  - An Actions cache saved on a branch can be read only from that branch and from the default branch.
  - CI ignores pushes to `main` (`ci.yml:9`, `branches-ignore: [main]`).
    That dates from `e204c85c` (2026-09-30), "Land on main by fast-forward to a CI-checked commit".
  - So `main` holds no cache, and every task branch starts cold.
  - Run 39124718097 logged "Cache not found" for Bun, Cargo, Nx, and dprint.
  - On 2026-10-19 the repo held 11.0 GB in 105 cache entries, over the 10 GB limit, and none was on `main`.
  - Each task branch saved about 1.7 GB: Cargo 1.37 GB, Bun 295 MB, setup-bun's binary 34 MB, dprint 11 MB.
  - Saving them took about 25s per run (39214683028: Cargo 19s, Bun 6s).
  - Correction: the report expected a Rust change to rebuild only the workspace crates it touches.
    Run 37901841141 (2026-10-09) restored the Cargo cache and still compiled every workspace crate, in every
    configuration, and no dependency.
    Checkout gives every source file a new mtime, so cargo treats each workspace crate as dirty.
    That run's rust track took about 80s with no Nx hit at all; workspace clippy took 5.7s.
    So the Cargo cache needs dependencies only (finding 4).
- 2. Waste, Medium: the rust track builds the same dependencies about five times.
  Each `cargo clippy -p X` and `cargo test -p X` resolves features for that crate alone, so shared dependencies
  rebuild with other feature sets.
  After workspace clippy, run 39124718097 compiled about 280 more units (tokio, rustls, rusqlite, serde_json,
  aws-lc-sys, hyper).
  - 2a. Per-crate clippy. Decision: fixed by item 4.
    - `koloda:lint` runs `cargo clippy --workspace --all-targets -- -D warnings` (`crates/koloda/project.json:8`).
    - `koloda-sync-proto`, `koloda-server`, and `koloda-sync` each have a `lint` target that clippies one crate
      (`project.json:8` in each).
      Each took 8s cold in run 39124718097 and 0.1–2s warm in run 37901841141.
    - All four run in `check:commit` (`package.json:19`), `check:rust` (`:24`), and `check:rust-push` (`:25`).
    - Correction: the per-crate targets are not plain duplicates.
      `koloda:lint`'s Nx inputs (`crates/koloda/project.json:11-16`) leave out `koloda-server` and `koloda-sync`.
      A change only there skips `koloda:lint`, and the per-crate targets cover it.
      Dropping them needs `koloda:lint`'s inputs widened to every workspace member.
  - 2b. One `cargo test --workspace` in place of the per-crate test targets. Decision: skipped.
    It loses per-crate Nx caching, so any Rust change reruns every Rust test.
    It also loses the check that each crate builds with only its own dependency features.
    With dependencies restored from `main` (item 1), the duplicate dependency builds no longer recompile.
- 3. Contention, Medium: the ts and rust tracks share one 4-core runner in one job.
  Decision: needs-decision after landing (question 5).
  - `tools/check-push.ts` runs the ts, rust, and format tracks at once.
    Nx runs up to 8 lib test tasks at once (`nx.json` `parallel: 8`), while cargo uses every core.
  - Proposed fix: a rust job and a ts-and-format job, plus a final job named `checks` that needs both.
    The final job needs `if: always()` and must fail unless every needed job succeeded.
    Otherwise a failed upstream job leaves `checks` skipped, and a skipped required check can count as passing.
  - The `main` ruleset requires the context `checks` from GitHub Actions (integration 15368).
    `tools/land.ts` queries `check-runs?check_name=checks`, so both keep working.
  - Cost: each job repeats setup (checkout, Bun, rustup, install), about 20s, in parallel.
  - Why deferred: with dependencies cached, the rust track took about 80s on a Rust change (run 37901841141).
    With Nx hits it takes seconds on a TS-only change.
    Both are under the ts track's 2m51s.
    The contention can be measured only on warm caches, and `main` saves them only after this task lands.
- 4. Size, Low–Medium: the Cargo cache is 1.37 GB (`~/.cargo/registry`, `~/.cargo/git`, `dist/target`).
  Decision: fixed by item 1 with `Swatinem/rust-cache` (question 2).
  - On 2026-10-09 the restore took 45s for a 1.57 GB cache.
  - `Swatinem/rust-cache` caches dependencies only, prunes stale files, and sets `CARGO_INCREMENTAL=0`.
    It keys on the toolchain and the lockfiles, and `save-if` limits saves to `main`.
  - The report's other option, `CARGO_PROFILE_DEV_DEBUG=line-tables-only`, is skipped as unmeasured.
    Dependencies already build with `debug = 1` (`Cargo.toml`, `[profile.dev.package."*"]`).
    Revisit it with finding 3's measurement.
- 5. Waste, Low: the Bun install cache costs more than it saves.
  Decision: fixed by item 3.
  - `bun install --frozen-lockfile` took 5s with no cache (run 39214683028).
  - Saving the 295 MB cache took 6s there; restoring it on a hit took 9s (run 37901841141).
  - setup-bun's own binary cache (34 MB per branch) stays: it restores in about 1s, in place of a download.
- 6. Quota, Low: the Docker workflow's layer cache.
  Decision: fixed by item 5 (question 3).
  - The Dockerfile runs `COPY . .` (`crates/koloda-server/Dockerfile:8`) before `cargo build --release`.
    So any change to the build context rebuilds from scratch, about 5–6 minutes.
  - `cache-to: type=gha,mode=max` (`docker.yml:42`) saves about 560 MB per run, on the same branch-scoped terms.
  - Correction: the report said the cache never pays off.
    A re-push with an unchanged context hits it: run 39111293235 (2026-10-18) took 25s.
    Still, Docker is not a required check, and `bun run land` waits only for `checks`.
  - `cargo-chef` with a cache filled from `main` is rejected: a bigger change to the deploy Dockerfile for a job
    nobody waits on.
- 7. Bug, High (new at triage): the Nx cache has never produced a hit in CI.
  Decision: fixed by item 2 (question 1).
  - Nx 20 and later find cached outputs through an index database.
    Outputs without their database rows are ignored.
  - Before Nx 23.3.0, CI cached `.nx/cache` (`ci.yml:78-84`) but not the database in `.nx/workspace-data/`.
    Run 37901841141 restored an Nx cache and still hit 0/12 lib tests and 0/1 on each Rust target.
  - Nx 23.3.0 (`6b63d45a`, 2026-10-12) keeps both under `~/.nx/<workspace id>/{cache,databases}`.
    Since then `.nx/cache` does not exist in CI.
    Every run logs "Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no
    cache is being saved", and the repo holds no `nx-` entry.
  - The database file is `<machine id>-v4.db`, named from `/etc/machine-id`.
    Nx has no setting for that name; `NX_CACHE_DIRECTORY` and `cacheDirectory` move the files, not the name.
  - Probe at triage, local, in a throwaway `HOME`, with `nx run @koloda/srs:test`:
    the second run hit 1/1;
    with the database renamed to another machine id, the run missed 0/1;
    renamed back to this machine's id, the run hit 1/1.
  - So a database restored onto another runner is ignored unless it is renamed to that runner's id.
    Whether hosted runners share one id is unknown; the rename is a no-op when they do.

Out:

- `web-github-pages.yml`, the manual deploy.
- The Node 20 deprecation warning on `actions/cache@v4` and `actions/checkout@v4`.
- `tsc -b` (52s): it does not run through Nx, so no cache here changes it.

## Open questions

- [x] 1. Finding 7: cache `~/.nx` and rename the restored database, or drop the Nx CI cache? — cache and rename
  (human, 2026-10-19).
- [x] 2. Finding 4: `Swatinem/rust-cache`, or `actions/cache` with `CARGO_INCREMENTAL=0` and line tables? —
  `Swatinem/rust-cache` (human, 2026-10-19).
- [x] 3. Finding 6: drop the gha cache, skip, or `cargo-chef`? — drop it (human, 2026-10-19).
- [x] 4. Flow? — `remote`: workflow edits can only be checked by CI (human, 2026-10-19).
- [ ] 5. Finding 3: split `checks` into parallel jobs? — open; decide from the first task branch run on warm
  caches after this lands.

## Plan

- [x] 1. Fill the Cargo and dprint caches from main only
  Goal (findings 1 and 4; question 2):
  - In `.github/workflows/ci.yml`, run on pushes to every branch, `main` included:
    replace `branches-ignore: [main]` (`:9`) with `branches: ["**"]`.
  - Rewrite the header comment's last line (`:6`, "Main itself is not re-checked").
    Say that `main`'s run fills the caches the branches read, since a branch can read only its own caches and
    `main`'s.
    Say that `bun run land` does not wait for it.
    Keep the lines about the ruleset and the job name.
  - Replace `Cache Cargo` and its comment (`:64-76`) with `Swatinem/rust-cache@v2`.
    Set `workspaces: ". -> dist/target/koloda"` and `save-if: ${{ github.ref == 'refs/heads/main' }}`.
    Keep the `docs_only` condition.
    A WHY comment says it caches dependencies only, because checkout gives every source a new mtime and cargo
    rebuilds each workspace crate anyway.
  - Split `Cache dprint` (`:86-92`) into `actions/cache/restore@v4` before Install and `actions/cache/save@v4`
    after Check push, with the same key.
    Save only on `main`, and only when the restore missed that exact key.
  Constraints: `ci.yml` only.
  Leave `Cache Bun` and `Cache Nx` to items 3 and 2.
  Leave the job name `checks`, the concurrency group, and Classify changes alone.
  On `main` the diff against `origin/main` is empty, so `main` already runs the full check.
  Done when:
  - `bun run check:format` passes;
  - the pushed tip's `checks` run is green;
  - its log shows rust-cache found no cache and did not save;
  - `gh cache list --ref refs/heads/task/ci-audit` shows no `v0-rust-` or `dprint-` entry from that run.
  Commit: Fill the Cargo and dprint CI caches from main only
  Depends on: none

- [x] 2. Restore the Nx cache in CI from main's runs
  Goal (finding 7; question 1):
  - Replace `Cache Nx` (`ci.yml:78-84`) with `actions/cache/restore@v4` on `~/.nx`.
    Key `nx-${{ runner.os }}-${{ github.run_id }}`, restore key `nx-${{ runner.os }}-`, same `docs_only`
    condition.
    A WHY comment says Nx 23 keeps its cache and the database that indexes it under `~/.nx/<workspace id>/`.
  - Add a step right after it, run only when the restore matched a key.
    It renames each file in `~/.nx/*/databases/` from `<other id>-<rest>` to `<this runner's id>-<rest>`.
    The id is `/etc/machine-id`; `<rest>` is `v4.db`, `v4.db-wal`, `v4.db-shm`, or `v4.lock`.
    A WHY comment says Nx names the database after the machine id and ignores outputs without their rows.
  - After Check push, add `actions/cache/save@v4` on `~/.nx` with the same key.
    Save only on `main`, and not on a docs-only run.
  Constraints: `ci.yml` only.
  Guard every path built from a variable (`${var:?}`).
  Do not set `NX_CACHE_DIRECTORY` or `cacheDirectory`: neither changes the database name.
  Done when:
  - `bun run check:format` passes;
  - the rename passes a local probe.
    In a throwaway `HOME` under `tmp/`, with `NX_DAEMON=false` and `CI=true`, run
    `node_modules/.bin/nx run @koloda/srs:test` twice; the second run hits.
    Rename the database to another 32-hex id, run the step's script, and run the target again: it hits 1/1.
  - the pushed tip's `checks` run is green, its Nx restore misses without failing, and the rename step is skipped;
  - `gh cache list --ref refs/heads/task/ci-audit` shows no `nx-` entry.
  Commit: Restore the Nx cache in CI from main's runs
  Depends on: 1

- [x] 3. Drop the Bun install cache from CI
  Goal (finding 5): delete `Cache Bun` (`ci.yml:56-62`).
  Constraints: `ci.yml` only.
  Leave setup-bun's own cache on.
  Done when:
  - `bun run check:format` passes;
  - the pushed tip's `checks` run is green, with Install passing;
  - `gh cache list --ref refs/heads/task/ci-audit` shows no `bun-Linux-` entry from that run.
  Commit: Drop the Bun install cache from CI
  Depends on: none

- [x] 4. Lint the Rust workspace with one clippy target
  Goal (finding 2a):
  - Widen `koloda:lint`'s inputs (`crates/koloda/project.json:11-16`) to every workspace member:
    `rust`, `{workspaceRoot}/crates/**/*`, `{workspaceRoot}/apps/electron/src-rust/**/*`, and
    `!{workspaceRoot}/crates/**/*.md`.
  - Delete the `lint` targets of `koloda-sync-proto`, `koloda-server`, and `koloda-sync` (`project.json:8` in each).
  - Drop their `nx run` calls from `check:commit`, `check:rust`, and `check:rust-push` (`package.json:19`, `:24`,
    `:25`).
  Constraints: leave every test target and `test:rust` alone.
  The pre-commit hook already says clippy is `koloda:lint`, so it needs no edit.
  Done when:
  - `bun run check:rust` runs one clippy and passes;
  - `bunx nx show project koloda-server --json` lists no `lint` target, and likewise for the other two;
  - after a throwaway comment edit in `crates/koloda-server/src`, `nx run koloda:lint` runs clippy instead of
    reading the cache; revert the edit;
  - `bun run check:push` passes, and the pushed tip's `checks` run is green.
  Commit: Lint the Rust workspace with one clippy target
  Depends on: none

- [ ] 5. Drop the gha layer cache from the Docker workflow
  Goal (finding 6; question 3): delete `cache-from` and `cache-to` (`docker.yml:41-42`).
  Constraints: `docker.yml` only; leave the Dockerfile alone.
  Done when:
  - `bun run check:format` passes;
  - the push runs the Docker workflow, which watches `docker.yml`, and it is green, smoke test included;
  - `gh cache list --ref refs/heads/task/ci-audit` shows no `buildkit-` or `index-buildkit-` entry.
  Commit: Drop the gha layer cache from the Docker workflow
  Depends on: none

## Outcome
