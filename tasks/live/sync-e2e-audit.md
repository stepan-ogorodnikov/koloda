# Desktop e2e sync spec audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, apps/electron-e2e/README.md, libs/e2e/README.md, apps/web-e2e/README.md, agents/VERIFY.md, agents/TESTING.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/MARKDOWN.md, agents/REVIEW.md, docs/specs/SYNC.md, docs/specs/MEDIA.md, docs/specs/ALGORITHMS.md, crates/koloda-server/README.md, apps/electron/README.md
Flow: local

## Intent

Settle every finding of the audit of the desktop e2e sync spec at `ab8cf1c9` (`main`).
The audit covered `apps/electron-e2e/src/sync.spec.ts` and the support code that `sync-e2e` added for it.
Its report was `tmp/audits/sync-e2e.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.

The audit ran `nx run @koloda/electron:test:e2e`: 86 tests, 78 passed, 8 failed, in 14.8 min.
`sync.spec.ts` passed in 16.3 s.
A rerun of the six specs that had failed in setup gave 30 tests, 28 passed, 2 failed.
Its verdict: the spec runs a real server and two real desktop instances and walks §Creating a Space, §Inviting a
Device, the first-run join, §Devices, and the live refresh of §Status.
Its last step would fail if the events socket or the renderer's refresh broke.
The release addon contains no file store.
No finding is Must-fix; finding 1 is Should-fix, and the rest are Later.
The human asked to address all of them, and the two stale desktop specs the report listed out of scope (here 8).

Done when:

- the desktop suite's after-load defaults step no longer fails on a navigation;
- `algorithm-delete.spec.ts` passes on desktop;
- the sync spec shows an image that arrives while its card is on screen on the second device;
- a sync server that fails to start, hangs on stop, or crashes mid-test leaves nothing behind and reports its log;
- `bun run check:push` runs the desktop addon's tests;
- the e2e README says how to run one desktop spec with fresh builds, and what the suite does not run;
- a full desktop suite run passes, and `bun run check:push` is green.

## Scope

Findings, numbered as in the report; 8 is the report's Out of scope heads-up.
Line numbers are at `ab8cf1c9`.

- 1. Risk, Should-fix: the sync spec inherits an intermittent failure from the shared after-load defaults.
  Decision: fixed by item 1.
  - The spec sets each device's defaults with `setupPageDefaults` (`sync.spec.ts:40-42` for device A, `:84` for B),
    which calls `applyPageDefaults(page, "after-load")` (`apps/electron-e2e/src/helpers.ts:4-6`).
    That runs `page.evaluate(seed)` on the loaded first window, then reloads (`libs/e2e/src/ui-flows.ts:28-30`).
  - In the full run, six tests failed at `ui-flows.ts:29` with "page.evaluate: Execution context was destroyed, most
    likely because of a navigation", each after about 2.8 s: `algorithm-add.spec.ts:10`, `assistant-chat.spec.ts:31`,
    `assistant-conversations.spec.ts:353`, `card-edit.spec.ts:60`, `lesson-controls.spec.ts:63`, and
    `template-clone.spec.ts:10`.
  - In the rerun of those six files, all six passed, and `assistant-chat.spec.ts:175` and
    `assistant-conversations.spec.ts:619` failed the same way.
    That is 8 failures in 116 test runs, each calling the helper once: about 1 call in 14.
    The sync spec calls it twice, so it fails about once in seven runs for a reason unrelated to sync.
  - The navigation's source is not established.
    The window loads its URL once (`apps/electron/src/window.ts:120`).
    `rg -n 'location\.(href|replace|assign|reload)' apps/electron-react/src libs -g '*.ts' -g '*.tsx'` finds only the
    error screen's reload button (`libs/app-react/src/lib/components/route-error.tsx:26`).
    Neither run log shows a dev-server reload, and the Electron trace records no page navigations.
  - `sync-e2e` ran only filtered runs, so it never saw this; whether its switch to a debug addon made the race more
    frequent is not established.
  - Only the desktop suite uses the after-load branch; the web suite seeds before load.
- 2. Risk, Later: the launcher's failure paths can leave a process or a directory behind.
  Decision: fixed by item 4.
  - `stop` sends SIGTERM and waits for `exit` with no deadline (`apps/electron-e2e/src/sync-server.ts:61-67`).
    Since `d54d1bcc` the server drains in-flight requests on SIGTERM (`crates/koloda-server/src/main.rs:376`, `:381`,
    `:421`).
    A hung drain holds the fixture teardown until Playwright's timeout; `rm(dataDir)` then never runs and the process
    outlives the test.
    In the audit's run the teardown was prompt.
  - A failed start leaves the `mkdtemp` directory (`:32`): when `init` prints no token (`:35`), or when
    `waitForListening` rejects on timeout, early exit, or a missing binary (`:56`, `:81-104`).
  - `sync-e2e` item 2 required that a failure leave no process behind.
- 3. Risk, Later: nothing runs the desktop addon's tests, the file store's included.
  Decision: fixed by item 5.
  - The addon has 9 tests: `e2e_secrets.rs` 3, `sync.rs` 5, `lib.rs` 1 (`rg -c '#\[test\]' apps/electron/src-rust/src`).
  - `check:rust-push` runs the tests of `koloda`, `koloda-sync-proto`, `koloda-server`, and `koloda-sync`
    (`package.json:25`); CI runs `bun run check:push` on `ubuntu-latest` (`.github/workflows/ci.yml:23`, `:105`).
  - `rg -n 'koloda-electron' package.json tools/*.ts .github/workflows/*.yml apps/electron/project.json` finds only the
    release build in `build-rust`.
    Clippy compiles the tests (`--workspace --all-targets`) but does not run them.
- 4. Risk (tests), Later: the path that motivated the spec is still uncovered.
  Decision: fixed by item 2.
  - The spec exists because of desktop sync audit finding 1: an image downloaded while its card was shown stayed as
    alt text, and only the whole path could catch it (`tasks/archive/sync-e2e.md`, Scope).
    The lesson loads images through `useAttachmentImages` (`libs/srs-react/src/lib/lessons/use-attachment-images.ts`).
  - The spec syncs text cards only (`sync.spec.ts:61`, `:113`); `sync-e2e` left images out because the suite had no
    image flow (its Open questions, 2).
    `rg -n -i 'image|attachment|setInputFiles|paste' apps/electron-e2e/src libs/e2e/src` finds nothing.
  - Images go in markdown fields only (`docs/specs/MEDIA.md` §Inserting Images).
    The desktop starter template's fields are both `text` (`libs/srs/src/lib/templates.ts:89-100`), so the spec needs
    a template with a markdown field.
    The field's "Insert image" button wraps a hidden file input (`FileTrigger`,
    `libs/srs-react/src/lib/cards/card-content-text-area.tsx:178-187`).
  - Attachments travel as `PUT` and `GET /v1/spaces/{space}/attachments/{id}` (`PROTOCOL.md` §Bodies).
- 5. Improvement, Later: a server crash mid-test loses the server's log.
  Decision: fixed by item 4.
  - `waitForListening` keeps stderr in a closure variable (`sync-server.ts:82-95`), and the handle does not expose it
    (`:21-25`).
  - After the server listens, its `exit` handler rejects a settled promise (`:96-99`), so a crash surfaces only as a
    UI timeout.
- 6. Improvement, Later: nothing documents how to run one desktop spec with fresh builds.
  Decision: fixed by item 6.
  - The README lists only the full suite and the typecheck (`apps/electron-e2e/README.md:18-21`).
  - `nx run electron-e2e:e2e -- <spec>` passes the argument to every build step too, so the filtered command and its
    prerequisites are recorded only in `tasks/archive/sync-e2e.md` (Open questions, 3).
    The prerequisites are the debug addon, its copy, the server build, and the preload (`project.json:19-22`).
  - A filtered run without them uses whatever `dist/target/koloda/debug/koloda-server` and
    `apps/electron/dist/koloda_electron.node` hold; `cargo test -p koloda-server` and `nx run @koloda/electron:serve`
    write those files too.
- 7. Product decision, Later: no automated run exercises the release addon or the OS keyring any more.
  Decision: needs-decision (Open questions, 2).
  - The `e2e` target builds and copies a debug addon for the whole suite (`apps/electron-e2e/project.json:19-20`).
  - The release-only `get_secret_store` (`crates/koloda/src/app/secrets.rs:49-52`) and the OS keyring behind it run in
    no test; before `sync-e2e`, the AI provider specs reached them on a release build.
  - `sync-e2e` recorded the cost ("not the build users get") in its Open questions, 1 (2026-10-16).
- 8. Stale tests (the report's Out of scope), Later: two desktop preset-delete tests fail on every run.
  Decision: fixed by item 3.
  - `algorithm-delete.spec.ts:52` and `:65` wait for links named "Simple" and "Complex", the web demo's starter
    presets (`apps/web/src/app/seed/en/algorithms/`).
  - Desktop "Start fresh" seeds one preset titled with `app.setup.default-title`, "Default"
    (`apps/electron-react/src/app/setup.ts:18-24`), so both time out after 30 s.
  - They came with `544857d7` (2026-09-18), a copy of the web spec without the platform's seed.
  - Delete is unavailable when fewer than two presets exist or the preset is the learning default
    (`libs/srs-react/src/lib/algorithms/delete-algorithm.tsx:51-52`, `docs/specs/ALGORITHMS.md` §Deleting Algorithms).
    On desktop the one starter preset is both, so no flow can show the last-preset rule apart from the default rule.

In:

- `libs/e2e`: the after-load branch of `applyPageDefaults`.
- `apps/electron-e2e`: `algorithm-delete.spec.ts`, `sync.spec.ts`, `sync-server.ts`, a proxy that holds attachment
  downloads, a suite-local image helper, and `README.md`.
- `package.json` `check:rust-push`: the addon's tests.

Out:

- Product code: the specs check `SYNC.md`, `MEDIA.md`, and `ALGORITHMS.md` as they stand; a product bug a spec finds
  goes to the human.
- The web suite's `algorithm-delete.spec.ts`: its last-preset test also passes on the default rule alone; that is the
  web suite's, and the guard's unit test is a separate gap (`delete-algorithm.test.tsx` tests only the successor).
- A release-addon run, unless Open questions 2 picks one.

## Open questions

- [x] 1. Triage? — fix all of them (human, 2026-10-17), including the two stale desktop specs (8).
  Finding 7 is a decision, so it is question 2.
- [x] 2. Finding 7: run one spec against the release addon, or accept that the keyring is checked only by hand? —
  accept, and say so in the e2e README (item 6), as proposed (human, 2026-10-17).
  A release run writes to the OS keyring whenever its spec stores a secret, which is what `sync-e2e` removed.
  A release smoke that stores none would not reach the keyring either.
- [x] 3. Finding 4: how does the spec make the image arrive after its card is on screen? — a small loopback proxy in
  front of the server for device B only, as proposed (human, 2026-10-17).
  It forwards every request and the events socket, and holds `GET …/attachments/{id}` until the spec releases it.
  `agents/TESTING.md` asks async tests to force the interleaving they claim.
  The other way is to add the card and open the lesson quickly and hope; it passes without testing the path whenever
  the image wins the race.
- [x] 4. Finding 4: where does the image-insert step live? — a helper in the desktop suite, beside the sync spec, as
  proposed (human, 2026-10-17).
  Sync is desktop only, as `sync-e2e` kept its steps out of `libs/e2e`.
  A shared flow in `libs/e2e` would ask for an image spec in each suite, since the suites mirror flow for flow.
- [x] 5. Finding 3: `check:rust-push` runs on every developer's machine, and CI runs only `ubuntu-latest`. — add the
  addon's tests to `check:rust-push`, checked on Linux in item 5, as proposed (human, 2026-10-17).
  Whether a napi crate's test binary links on macOS and Windows is not checked here; if it does not, the line moves
  to a CI-only step instead.
- [x] 6. Finding 8: what does the desktop last-preset test check? — keep the web flow's shape on the desktop seed, as
  proposed (human, 2026-10-17).
  Test 1 opens "Default" and finds delete unavailable.
  Test 2 adds a preset, deletes it, and finds delete unavailable on "Default".
  On desktop, as on web, that test also passes on the default rule alone (Scope, 8); dropping it would break the
  suites' flow-for-flow mirror.
- [x] 7. Who runs the desktop suite while implementing? — the agent; the human gave permission to run the tests it
  needs in the implementing session (human, 2026-10-17).
  `agents/VERIFY.md` lets an agent run Playwright only when the human asks in that session.
  Items 1 to 4 can only be proven by a run.
- [x] 8. Flow? — `local` (human, 2026-10-17).

## Plan

Written for the answers to Open questions 2 to 7.

- [ ] 1. Retry the desktop e2e defaults when a navigation interrupts them
  Goal (finding 1):
  - In `applyPageDefaults` (`libs/e2e/src/ui-flows.ts:17-32`), the `after-load` branch waits for the page's `load`
    state before it evaluates the seed.
  - If the evaluate fails because its execution context was destroyed, it waits for `load` again and evaluates once
    more; any other error, or a second failure, is thrown.
    The reload that follows replaces the page either way, so seeding twice is harmless.
  - WHY comment there: the desktop's first window can navigate once more after `domcontentloaded`, and the cause is
    not known; name the observed rate and the audit.
  - The `before-load` branch, which the web suite uses, does not change.
  Constraints: `libs/e2e/src/ui-flows.ts` only; no product change.
  Done when:
  - `bunx nx run electron-e2e:typecheck` and `bunx nx run web-e2e:typecheck` pass, and `bun run check:push` is green.
  - A filtered run of the eight specs that failed in the audit, with `--repeat-each=3`, shows no "Execution context
    was destroyed" (Open questions, 7).
  Manual verify: none — test support only; the runs are the check.
  Commit: Retry desktop e2e defaults when a navigation interrupts them
  Depends on: none

- [ ] 2. Cover an image that arrives while its card is on screen in the sync spec
  Goal (finding 4):
  - `apps/electron-e2e/src/sync-proxy.ts` exports `startSyncProxy(targetUrl)`.
    It listens on a free loopback port and forwards every HTTP request and the events socket's upgrade to the server.
    It holds each `GET /v1/spaces/{space}/attachments/{id}` (not `…/attachments/missing`) until `release()`.
    It returns `{ url, release, stop }`.
  - A suite-local helper `insertCardImage` attaches a small PNG to a markdown field through the field's hidden file
    input (`setInputFiles`); the PNG is written in the test's temp directory.
  - In `sync.spec.ts`, after the existing steps, device A:
    - adds a template with a markdown field and a deck that uses it;
    - adds a card whose markdown field holds the image.
  - Device B joined through the proxy's URL.
    It opens a lesson on that deck and sees the image's alt text.
    Then the spec releases the proxy, and B shows the image without a reload.
  - Update `apps/electron-e2e/README.md`: the proxy in the Architectural Map, and images in the sync spec line.
  Constraints:
  - Test code only; if the spec finds a product bug, stop and report it.
  - Steps go in the spec or suite-local helpers, not `libs/e2e` (Open questions, 4).
  - The proxy lives inside the test, as the server does.
  Done when:
  - `bunx nx run electron-e2e:typecheck` and `bun run check:push` pass.
  - A filtered run of `sync.spec.ts` passes three times in a row.
  - With the proxy's release removed, the spec fails at the image, checked once by hand.
  Manual verify: none — the change is the test itself, and its run is the check.
  Commit: Cover an image that arrives while its card is on screen in the sync spec
  Depends on: none

- [ ] 3. Point the desktop preset-delete specs at the desktop starter preset
  Goal (finding 8):
  - `apps/electron-e2e/src/algorithm-delete.spec.ts:52`: open "Default", the desktop's one starter preset, and find
    "Delete preset" unavailable.
  - `:65`: add a preset with the shared `createAlgorithm` flow, delete it, and find "Delete preset" unavailable on
    "Default" (Open questions, 6).
  - Test names stay, so the suites still mirror flow for flow.
  Constraints: the desktop spec only; the web spec and product code stay as they are.
  Done when:
  - A filtered run of `algorithm-delete.spec.ts` passes.
  - `bunx nx run electron-e2e:typecheck` and `bun run check:push` pass.
  Manual verify: none — tests only.
  Commit: Point the desktop preset-delete specs at the desktop starter preset
  Depends on: none

- [ ] 4. Clean up and report a sync server that fails in desktop e2e
  Goal (findings 2 and 5):
  - `stop` (`sync-server.ts:61-67`) waits up to 5 s for the server to exit after SIGTERM, then sends SIGKILL, waits,
    and removes the data directory either way.
  - `startSyncServer` removes its data directory, and kills the process if one started, when `init` or
    `waitForListening` fails, then rethrows.
  - The handle exposes the server's log, kept as `waitForListening` drains it.
    The `syncServer` fixture (`sync.spec.ts:20-24`) attaches it to the test as `koloda-server.log` when the test did
    not pass.
  Constraints: `sync-server.ts` and the fixture only.
  Done when:
  - `bunx nx run electron-e2e:typecheck` and `bun run check:push` pass, and a filtered run of `sync.spec.ts` passes.
  - Checked once by hand: a failing assertion in the spec attaches the log; a wrong binary path leaves no
    `/tmp/koloda-e2e-server-*` directory.
  Manual verify: none — test support only.
  Commit: Clean up and report a failed sync server in desktop e2e
  Depends on: 2

- [ ] 5. Run the desktop addon's tests in the push gate
  Goal (finding 3):
  - `check:rust-push` (`package.json:25`) runs the addon's tests after the four crates' tests, in the same
    `dist/target/koloda` target directory.
  - Either an nx `test` target for the addon or a direct `cargo test -p koloda-electron` with
    `CARGO_TARGET_DIR=dist/target/koloda`, matching how the crates' targets set it.
  - `tools/check-push.ts`'s header comment names the addon's tests.
  Constraints: the gate's Rust track only; the TS and format tracks stay.
  Done when:
  - `bun run check:push` is green and its log shows the addon's 9 tests.
  - Breaking the file store's write fails `bun run check:push`, checked once by hand.
  Manual verify: none — gate config.
  Commit: Run the desktop addon's tests in the push gate
  Depends on: none

- [ ] 6. Document single-spec desktop e2e runs and the untested release addon
  Goal (findings 6 and 7):
  - `apps/electron-e2e/README.md` How to run: one line for a single spec, with the `e2e` target's first four
    commands (`project.json:19-22`), then `bunx playwright test --config apps/electron-e2e/playwright.config.ts <spec>`.
    It says why the filter cannot go after `nx run electron-e2e:e2e --`.
  - Where it sits: the suite never runs the release addon, so the OS keyring path is checked by hand
    (Open questions, 2).
  Constraints: docs only.
  Done when: `bun run check:push` is green.
  Manual verify: none — docs only.
  Commit: Document single-spec desktop e2e runs and the untested release addon
  Depends on: none

## Outcome

<what shipped>
