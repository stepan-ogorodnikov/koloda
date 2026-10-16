# Desktop e2e sync spec

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/VERIFY.md, agents/TESTING.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/MARKDOWN.md, agents/REVIEW.md, apps/electron/README.md, agents/RUST.md, crates/koloda-server/README.md, docs/specs/SYNC.md
Flow: local

## Intent

Cover desktop sync from end to end: renderer → IPC → addon → engine → server, and back on a second device.
This is finding 10 of the desktop sync audit at `ad147702`.
That audit's report was `tmp/audits/sync-desktop.md`, which git ignores.
Its task, `tasks/archive/sync-desktop-audit.md`, settled every other finding and moved this one here
(its Open questions, 2).
This file restates what the finding needs, so the next session does not need either.

Done when:

- `apps/electron-e2e` has a sync spec.
  It starts `koloda-server` on loopback, creates a space on one device, and joins a second device with a pairing code.
- The spec checks three things on the second device:
  it lists both devices, it shows a card the first device made before the join,
  and it shows a card the first device adds after the join without a reload.
- No desktop e2e run writes to the OS keyring, the sync spec's tokens and the AI provider specs' keys alike.
- `bun run check:push` is green, and the spec passed in a run of the desktop suite.

## Scope

The finding, restated (Improvement, Later):

- No e2e test covers a sync flow.
  `apps/electron-e2e/src` has no sync spec.
- The settings-react tests stub `SyncQueries`, and the addon tests pin serde shapes.
  The engine tests stop at the engine.
  So nothing runs the whole path.
- Audit finding 1 failed only on that path, so no unit test could have caught it.
  An image that downloaded while its card was on screen stayed as alt text, because the renderer invalidated a query
  that no screen held.
- The audit's fix direction: one `apps/electron-e2e` spec.
  It starts `koloda-server` on loopback, creates a space, and joins a second user-data directory with a code.
  Then it checks that the second device lists both devices and shows a card made on the first.

What blocks it, checked at `5d0a25b8`:

- Secrets go to the real OS keyring.
  - `get_secret_store()` (`crates/koloda/src/app/secrets.rs`) returns the keyring store.
    The sync engine takes it at start (`apps/electron/src-rust/src/sync.rs:165`).
    It keeps device tokens as `sync.token.<device>` and `sync.pending_token.<nonce>`
    (`crates/koloda-sync/src/engine.rs:687-693`).
  - The suite already writes there: the AI provider specs save fake API keys
    (`ai-providers-add.spec.ts:11`, `ai-providers-edit.spec.ts:22`, `ai-providers-delete.spec.ts:15`).
    The keys are named per profile and the tokens per device, so runs do not clash.
    They do pile up in the user's keyring under the `koloda` service.
    On macOS a dev Electron build reaching the keychain can prompt.
    A machine without a running secret service cannot store them at all.
  - `set_test_secret_store` exists, but only under `debug_assertions`.
    The suite's addon is a release build: the `e2e` target depends on `@koloda/electron:build-rust`,
    which runs `cargo build -p koloda-electron --release` (`apps/electron/project.json`).
    The seam's WHY comment states that on purpose: release builds have no override.
  - `KOLODA_E2E` changes only devtools (`apps/electron/src/window.ts:86`).
- There is no server launcher.
  - The fixtures launch one Electron app per test (`apps/electron-e2e/src/fixtures.ts`).
  - Nothing builds or starts `koloda-server`.
    The CLI has what a launcher needs (`crates/koloda-server/README.md` §Running).
    `init --data-dir <dir>` prints `Setup token: <token>`.
    `serve --data-dir <dir> --insecure-http --listen 127.0.0.1:<port>` prints
    `koloda-server: listening on http://<addr>` to stderr once it is bound.
    Devices accept plain HTTP to their own machine (`docs/specs/SYNC.md` §Servers).
  - `serve` holds growing writes below `--min-free-disk` (1 GiB by default).
    So a dev machine with a nearly full disk would fail the spec for a reason that has nothing to do with sync.
- Two app instances can run side by side.
  - `KOLODA_USER_DATA` sets Electron's `userData` (`apps/electron/src/main.ts:13-18`).
    So each instance has its own database, window state, and Chromium storage.
  - Nothing takes a single-instance lock.
  - Both windows load the one renderer dev server on port 3000.
- Agents do not run Playwright suites (`agents/VERIFY.md`), so `bun run check:push` never runs the spec.
  The spec is proven only by a run of the desktop suite (Open questions, 3).

In:

- `apps/electron/src-rust`: a file-backed secret store for debug builds, chosen by an environment variable.
- `apps/electron/scripts/copy-native-addon.ts`: copy a debug build as well as a release one.
- `apps/electron-e2e`: a debug addon and a `koloda-server` build in the `e2e` target, the secrets file in the
  fixtures, a launcher for a second device, a sync server launcher, the sync spec, and the README.
- `libs/e2e`: shared sync UI flows only if the web suite could ever use them; it cannot, since the web demo has no
  sync (`SYNC.md` §Platform Availability), so expect none.

Out:

- Product behavior: the spec checks `SYNC.md` as it stands.
  A failure it finds goes to the human, not into this task's items.
- An image that downloads while its card is on screen (audit finding 1's path).
  The suite has no image flow yet (Open questions, 2).
- Add or Replace, Leave, Remove, and stops.
  The engine and settings-react tests cover them, and each would add a spec of its own.
- Clearing keyring entries that earlier runs left.
- Running the desktop suite in CI: `agents/VERIFY.md` keeps it a human tool.

## Open questions

- [x] 1. Keyring: how does the suite keep secrets out of the OS keyring? — a debug addon with a file store, as
  recommended (human, 2026-10-16).
  Recommended: build the suite's addon in debug and reuse the `debug_assertions` seam.
  The addon then installs a file store when `KOLODA_E2E_SECRETS` names a file, and the fixtures put that file in each
  test's user-data directory.
  This keeps the seam's rule that release builds have no override.
  The AI provider specs stop writing to the keyring too.
  The cost: the whole desktop suite runs a debug addon, which is slower and is not the build users get.
  Other choices:
  - a cargo feature `e2e` that compiles the store into a release build of its own, kept in a separate target directory
    so it never reaches a package;
  - no seam: the spec writes tokens to the keyring as the AI provider specs write keys today.
    Item 1 then drops out, and the spec runs only where a secret service is up.
- [x] 2. Coverage: what does the spec check? — the one test below, as recommended (human, 2026-10-16).
  Recommended: one test.
  - Device A starts fresh, makes a deck with a card, creates a space from Settings → Sync, and opens "Invite a device".
  - Device B joins from the first-run screen with that code.
  - Device B lists both devices and shows A's card.
  - A adds a second card, and B shows it without a reload.
  The first-run join is the path a new user takes, and audit findings 3 and 5 lived there.
  The pairing code comes from A's dialog, not `koloda-server pair`, so the invite flow is covered too.
  The last step goes through the events socket and the renderer's refresh, the kind of path finding 1 broke.
  Left out: a join from Settings → Sync on a device that started fresh, and images.
- [x] 3. Who runs the spec before Self-review? — as recommended (human, 2026-10-16):
  the human asks for a filtered run in the session that implements item 2.
  `agents/VERIFY.md` lets an agent run a Playwright command only when the human asks for it in that session.
  Without a run, item 2 is written blind against selectors and timing, and only typechecked.
  Recommended: in the session that implements item 2, the human asks for a filtered run of this spec, so the agent
  can iterate.
  That run is the `e2e` target's build steps, then
  `bunx playwright test --config apps/electron-e2e/playwright.config.ts sync.spec.ts`.
  An argument after `nx run electron-e2e:e2e --` would reach the build steps too, so the filter goes to Playwright.
  Otherwise the human runs it after item 2, and failures come back as new commits.
- [x] 4. Flow? — `local` (human, 2026-10-16).

## Plan

Written for the answers to Open questions 1 to 3.

- [x] 1. Keep desktop e2e secrets out of the OS keyring
  Goal: no desktop e2e run reads or writes the OS keyring.
  In debug builds only, `KolodaDb::new` (`apps/electron/src-rust/src/lib.rs`) reads `KOLODA_E2E_SECRETS`.
  When the variable is set, it installs a file-backed `SecretStore` for that path through
  `koloda::app::secrets::set_test_secret_store`.
  It does this before any IPC call, so the AI repo and the sync engine both get the file store.
  The store keeps a JSON object of key to value.
  A missing file reads as empty, and every `set` and `remove` writes the whole file.
  The `e2e` target of `apps/electron-e2e/project.json` builds its own addon in place of depending on `build-rust`:
  `cargo build -p koloda-electron`, then `copy-native-addon.ts` from the debug profile.
  The script takes the profile as an argument and defaults to release, so `serve` and `build-rust` are unchanged.
  `fixtures.ts` sets `KOLODA_E2E_SECRETS=<userDataDir>/secrets.json`, so the file goes with the temp directory.
  Update the seam's WHY comment in `crates/koloda/src/app/secrets.rs` to name the e2e user.
  Update the `apps/electron-e2e/README.md` map (Where it sits: a debug addon; Fixtures: the secrets file).
  Constraints: compile the store and the env read under `#[cfg(debug_assertions)]` only, so a release addon has
  neither.
  Leave `build-rust`, `serve`, `build`, and `copy-native-release.ts` as they are.
  Do not touch the AI or sync code that calls `get_secret_store()`.
  Done when: `cargo test -p koloda-electron` passes, with a new test of the store.
  The test covers a value that round-trips through a fresh store on the same file, a missing key reading as `None`,
  and `remove`.
  `cargo build -p koloda-electron --release` passes; that build has no store, which the cfg gate guarantees.
  `bunx nx run electron-e2e:typecheck` and `bun run check:push` pass.
  Manual verify (desktop): run `ai-providers-add.spec.ts`; no new `koloda` entry appears in the OS keyring, and the
  test's `secrets.json` held the key while it ran.
  Commit: Keep desktop e2e secrets out of the OS keyring
  Depends on: none

- [ ] 2. Cover joining a space in a desktop e2e spec
  Goal: `apps/electron-e2e/src/sync.spec.ts` runs a space across two desktop instances and one real server.
  Launch: `fixtures.ts` exports `launchApp(userDataDir)`, which the `electronApp` fixture now calls.
  A spec can then start a second device on a temp directory of its own and close it at the end.
  Server: `apps/electron-e2e/src/sync-server.ts` exports `startSyncServer()`.
  It makes a temp data directory and runs `koloda-server init --data-dir <dir>`.
  It reads the setup token from the `Setup token: <token>` line.
  It picks a free loopback port by binding port 0 in Node and closing it.
  It spawns `serve --data-dir <dir> --insecure-http --listen 127.0.0.1:<port> --min-free-disk 0 --reserve-disk 0`.
  It waits for `koloda-server: listening on` on stderr, and fails with the server's stderr if the process exits first.
  It returns `{ url, setupToken, stop }`; `stop` ends the process, waits for it, and removes the directory.
  The `e2e` target builds the server before Playwright:
  `CARGO_TARGET_DIR=dist/target/koloda cargo build -p koloda-server`, the directory the crate's `test` target uses.
  The launcher runs the binary there, with `.exe` on Windows.
  Spec, one test, with steps per `docs/specs/SYNC.md`:
  - Device A (the fixture's page): defaults, "Start fresh", a deck with one card.
  - A: Settings → Sync → create a space with the server's address and setup token, named `E2E space`.
    Name the device `Device A`, since both instances default to the computer's name.
  - A: "Invite a device"; read the pairing code from the dialog.
  - Device B (`launchApp` on a second temp directory): defaults, then "Join a space" on the first-run screen.
    Enter the address and the code, and name the device `Device B`.
  - B: the preview names `E2E space` with 1 deck and 1 card; "Join".
  - B: the app opens after the download; the deck and its card show.
  - B: Settings → Sync lists `Device A` and `Device B`, with B marked as this device.
  - A: add a second card to the deck.
  - B: the second card shows without a reload.
  Update `apps/electron-e2e/README.md`: the e2e target also builds `koloda-server`, a Sync server line in the map, a
  note on second devices under Fixtures, and sync in the Specs list.
  Constraints: no product code changes.
  If the spec finds a product bug, stop and report it (Scope, Out).
  Keep the server and the second app inside the test's lifetime, so a failure leaves no process behind.
  Use roles and visible copy for selectors, as the other specs do.
  Put sync steps in the spec or a suite-local helper, not `libs/e2e`, since the web demo has no sync.
  Done when: `bunx nx run electron-e2e:typecheck` and `bun run check:push` pass.
  The spec passes in a filtered run of `sync.spec.ts` (Open questions, 3).
  It fails if B never shows the second card, checked once by commenting out A's second card.
  Manual verify: none — the change is the test itself, and its run is the check.
  Commit: Cover joining a space in a desktop e2e spec
  Depends on: 1

## Outcome

<what shipped>
