# Sync in the desktop app

Status: ready

## Intent

A desktop user sets up and runs sync from the app.
Beyond running the server, nothing needs a command line.
They create a space on their own server, invite another desktop with a pairing code, and join a space from Settings
or from the first-run screen.
They see whether sync works, why it stopped and what to do, and which devices are in the space.

This is the desktop UI step of the sync work.
The engine (`koloda-sync`), the server, and the protocol are done, and this task does not change them.

Done when:

- two desktop apps on one `koloda-server` reach the same decks, cards, reviews, and images through the UI alone;
- every stop reason the engine reports shows in Settings → Sync, with what the user can do about it;
- the web demo shows no sync, as `docs/decisions/APP-ROLES.md` allows;
- `docs/specs/SYNC.md` describes all of it.

## Scope

In:

- `apps/electron/src-rust`: the engine inside `KolodaDb`, its `sync_*` methods, the worker for host calls,
  local-change notices, events, and `SyncError` as `{ code, details }`.
- `apps/electron`: `sync-ipc.ts`, the `KolodaDb` mirror, nudges, `IPC.md`, and `README.md`.
- `libs/native-ipc`: the `cmd_sync_*` channels and the sync event channel in `DataIpc`.
- `apps/electron-react`: the event subscription, query invalidation per kind, the first-run screen, and the title bar.
- `libs/settings-react` and `libs/app-react`: Settings → Sync and its route, shown only on the desktop.
- `libs/app`: `sync.*` error messages.
- The `en` and `ru` locales of every package touched.
- `docs/specs/SYNC.md`, new; `INTERFACE-SETTINGS.md` and `LEARNING-SETTINGS.md` point at it for first setup.
- `crates/koloda-sync/README.md`, which says no app calls the engine yet.

Out:

- Mobile, QR codes, and an attachment download policy: phase 2 of the proposal.
- The web host: it never syncs.
- Metered networks: the desktop reports an unmetered network, so `allow_metered` has no caller yet.
- The pairing setup hint: the first-run screen already asks for language and color scheme.
  `issue_pairing` gets `None`.
- Renaming a device: the server has no endpoint for it.
- `sync_now` and `tick`: the desktop runs the background runner, and "Sync now" is a nudge (question 2).
- `koloda-sync`, `koloda`, `koloda-server`, and `koloda-sync-proto`: no change expected.
  If the host needs one, stop and record it under Open questions.
- The two follow-ups `sync-audit-fixes` noticed: a lease end's scan, and a file with sync state but no settings rows.
- E2e tests (question 5): the human checks each item from its Manual verify brief (`agents/VERIFY.md`).
- `agents/INDEX.md`: agents do not load it, so routing tasks to `SYNC.md` there is the owner's.

## Open questions

The owner took every recommendation on 2026-10-10, except question 5: no e2e tests in this task.

- [x] 1. Area guides?
  - Proposed: `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`,
    `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md`, `agents/TESTING.md`, and `agents/RUST.md`.
  - For the new spec and screens: `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/I18N.md`, `agents/LAYOUT.md`, and
    `agents/CSS.md`.
  - `agents/VERIFY.md` for the manual checks, and `agents/REVIEW.md` for self-review.
  - Also `apps/electron/IPC.md`, `docs/decisions/APP-ROLES.md`, `crates/koloda-sync/README.md`, and
    `crates/koloda-sync-proto/PROTOCOL.md`.
  - Answer: the set proposed.
    Read on 2026-10-10, they changed the draft:
    - agents start no app and no server (`agents/VERIFY.md`), so each manual check is a Manual verify brief for the
      human;
    - `SYNC.md` opens with Scope, What it is, and Core model, and the first-setup specs point at it
      (`agents/FUNCTIONAL-SPECIFICATIONS.md`);
    - tests that only check wiring are dropped (`agents/TESTING.md`).
- [x] 2. Which thread runs the engine's host calls?
  - Every `Engine` call blocks until its network work is done.
    On the `koloda-db` worker, it would hold every read the UI makes behind the network.
  - Recommended: one more FIFO worker, `koloda-sync`, with the promise pattern of `KolodaDb::run`.
    The desktop never calls `sync_now`, since "Sync now" is a `nudge`, so no call on that worker runs a cycle.
    Status arrives by event, and `cmd_sync_status` reads it on demand.
  - Alternative: NAPI async tasks on the libuv pool.
    Calls may then overlap; the engine already runs one cycle at a time.
  - Either way the engine shares the app's `Database`.
    A bootstrap page holds the connection for one transaction, and UI reads wait behind it.
    Item 5's Manual verify looks at that on a space of a few thousand cards.
  - Answer: the recommendation, one FIFO `koloda-sync` worker.
- [x] 3. Where does the engine's `Starter` come from?
  - When no algorithm or template is live, repair creates one from `Starter`, title included.
  - Recommended: the renderer passes it in `cmd_sync_start`, built as `seedDB` builds the seed, with the translated
    title.
  - Alternative: main builds it from the `@koloda/srs` defaults; main has no i18n, so the title is not translated.
  - Answer: the recommendation, the renderer passes it.
- [x] 4. What does the first-run screen show while a blank file joins?
  - A blank joiner's database reads as set up once its settings are seeded, before any algorithm or template arrives.
  - Recommended: the setup screen stays until the first bootstrap leaves `Bootstrapping`.
    It shows progress and errors from the status, and the engine retries on its own.
    The only way out is quitting the app.
  - Alternative: the app opens at once and fills in.
    Forms that need an algorithm or a template fail until they arrive.
  - Answer: the recommendation, the setup screen waits for the first bootstrap.
- [x] 5. Does a test run two apps against a real server?
  - Recommended: yes, one `electron-e2e` spec.
    The e2e target builds `koloda-server`, and the spec runs `serve --insecure-http` on a loopback port.
    `check:push` does not run `electron-e2e`, so the item's `Done when` names `nx run electron-e2e:e2e`.
    `apps/web-e2e` gets no mirror, and the e2e README notes the exception.
  - Alternative: the manual checks only.
  - Answer: no e2e tests in this task (owner).
    The drafted item 9 is dropped, and its manual check of a large join moved to item 5.
- [x] 6. The spec in one item first, or with each item?
  - Recommended: each item writes the `SYNC.md` sections it makes true (`agents/IMPLEMENTATION-PLAN.md` §Sizing).
    This plan fixes the screens now, so approving it approves them.
  - Alternative: a docs-only item 1 with the whole spec, reviewed before any screen.
  - Answer: the recommendation, each item writes its sections.
- [x] 7. Does sync show outside Settings?
  - Recommended: a title bar indicator while the file is in a space (item 8).
    It shows syncing, idle with the last sync in its tooltip, and a stop that needs the user.
    Clicking it opens Settings → Sync.
  - Alternative: Settings only; a stopped sync goes unnoticed until the user looks there.
  - Answer: the recommendation, a title bar indicator.

## Plan

- [x] 1. Run the sync engine in the desktop app
  Goal:
  - `koloda-electron` depends on `koloda-sync`, `koloda-sync-proto`, and `uuid`.
  - `KolodaDb` keeps a clone of its `Database`, which shares one connection, and a slot for the engine.
    Sync methods sit in the `impl KolodaDb` block, so `koloda-db.test.ts` checks their mirror.
  - `sync_start(starter, on_event)`:
    - `Engine::start` with the shared database, `get_secret_store()`, `HttpTransport`, `SystemDisk`, the platform of
      the build target, and the starter of question 3;
    - a second call does nothing;
    - it starts the runner when the file is enrolled, and the call that enrolls a file starts it otherwise
      (items 2, 5, and 6);
    - the runner must not run on a file that is not enrolled, where every backoff emits an `Error`.
  - Events cross through a non-blocking threadsafe function.
    Main logs `Error` events and sends the others to every window on a sync event channel.
  - Host calls run on the worker question 2 picks, never on `koloda-db`.
  - `sync_status` and `sync_nudge` are the first host calls; later items add theirs.
  - Every product write method calls `notify_local_change` once it succeeds.
    That covers cards, lesson results, decks, templates, algorithms, and settings.
    Conversations, AI profiles, and attachment writes capture nothing and need no notice.
    One notice too many costs one pull.
    The assistant's tools write through `KolodaDb`, so they are covered.
  - `SyncError` crosses as `{ code, details }` with `sync.<name>` codes.
    `libs/app` gets their messages, and the error parity test covers them.
  - Status and events cross as plain wire objects, each `Kind` as its wire name.
  - Main, `sync-ipc.ts`:
    - registers `cmd_sync_start`, `cmd_sync_status`, and `cmd_sync_nudge`;
    - nudges when the system resumes (`powerMonitor`);
    - supplies the default device name, the OS host name.
  - `libs/native-ipc`: the channels and the event payload in `DataIpc`.
  - Renderer:
    - `app-entry.tsx` calls `cmd_sync_start` once the database status is known;
    - it nudges when a window gains focus and when the network comes back (`online`);
    - it subscribes to events once;
    - `Changed { kinds }` invalidates each kind's query keys, `AttachmentsFetched` each image's, and `Status` updates
      the status query's cache;
    - one map from kind to query keys, with a test that every `Kind` has an entry;
    - the `staleTime` WHY in `app-providers.tsx` says rows change by mutation or by sync.
  - `IPC.md` §Sync, `apps/electron/README.md`, and `crates/koloda-sync/README.md` describe the above.
  - Implementation:
    - the host is `SyncHost` in `src-rust/src/sync.rs`; one generic `queue` runs both workers' jobs;
    - `uuid` waits for item 4, its first user;
    - the codes are `sync_error_codes` in `sync.rs`, and `error-parity.test.ts` parses them beside `error_codes`;
    - `SyncStatus` lives in `@koloda/app`, for the settings screens; `SyncEvent`, `SyncKind`, and `SyncStarter`
      live in `@koloda/native-ipc`;
    - the renderer's start and nudges are `use-sync-engine.ts`, and `sync-events.ts` maps kinds to query keys;
      its test reads the kinds from the Rust registry;
    - the renderer's Vitest config aliases the Lingui macro as the web's does, so a test can import query keys;
    - `seedDB` and the engine's starter share `starterContent` in `setup.ts`;
    - `bun run check:push` does not run `cargo test -p koloda-electron`, as before; its tests were run by hand.
  Constraints:
  - No change to `koloda-sync`, `koloda`, or the server.
  - The `koloda-db` FIFO invariant holds: sync queues nothing on that thread.
  - Quitting does not wait for a cycle; the protocol makes a lost reply safe.
  Done when:
  - `koloda-db.test.ts` passes with the new methods mirrored;
  - a main test: an `Error` event is logged and reaches no window, and every other event reaches every window;
  - a renderer test: a `Changed` event invalidates the queries that show its kind, cards' lessons included;
  - a Rust test in the addon for the error and status wire mapping;
  - Manual verify: none — no file can enroll until item 2;
  - `bun run check:push` green.
  Commit: Run the sync engine in the desktop app
  Depends on: none

- [x] 2. Create a sync space from Settings
  Goal:
  - Settings → Sync: a page in `libs/settings-react`, with its route in `libs/app-react`.
    - Desktop only: the web shows no link, and `/settings/sync` is not found there.
    - The host tells the route whether it syncs, for example by an optional `sync` member of `Queries` that the web
      leaves out.
  - A file in no space shows two actions: "Create a space" (this item) and "Join a space" (item 5).
  - The create form asks for the server URL, the setup token, the space's name, and this device's name.
    - The device name defaults to the host name main supplies.
    - Its errors: a URL that is neither `https` nor `http` to this machine, a wrong setup token, a server out of
      reach.
    - `cmd_sync_create_space` calls `create_space`, then starts the runner.
  - A file in a space shows its status:
    - the state: idle, syncing, downloading, waiting for a choice, or stopped;
    - the last sync, changes waiting to upload, and images waiting to move;
    - while downloading, how far each lane is behind;
    - a "Sync now" button, which nudges;
    - a stop, as one line with its message until item 7.
  - `docs/specs/SYNC.md`, per `agents/FUNCTIONAL-SPECIFICATIONS.md`:
    - Scope, naming the specs it leaves out;
    - What it is;
    - Core model: server, space, device, and pairing code, with §Relationships;
    - platform availability (absent on the web), creating a space, and status.
  - Implementation:
    - the host tells the route by `syncQueriesAtom` in `@koloda/core-react`, as `addAttachmentFromUrlAtom` does, not
      by a `Queries` member: `Queries` is the contract both hosts fill;
    - the page lives in `libs/settings-react/src/lib/sync/`;
    - the form's own checks are TS-only codes `validation.sync.*`; the engine owns the URL rule;
    - while downloading, the page shows the two lanes' lag as one count of changes left;
    - the link and route gating is wiring, so it has no test (`agents/TESTING.md`); the spec states it;
    - the route tree was regenerated with `@tanstack/router-generator` and the renderer's plugin options.
  Constraints:
  - The setup token is never stored; it goes to the server once.
  - The page follows the other settings pages' layout.
  - Strings follow `agents/I18N.md`, in `en` and `ru`.
  Done when:
  - component tests: the form refuses an insecure URL and shows each server error; each state renders its copy;
    without the host's sync support, the link and the route are absent;
  - Manual verify, with `koloda-server serve --insecure-http` running on the same machine:
    - Settings → Sync → create a space → the status reaches idle, and `koloda-server spaces` lists the space;
    - an `http` URL to another machine → the form refuses it;
    - the web app → Settings shows no Sync;
  - `bun run check:push` green.
  Commit: Create a sync space from Settings
  Depends on: 1

- [x] 3. Invite a device with a pairing code
  Goal:
  - "Invite a device" on a file in a space calls `cmd_sync_issue_pairing`.
  - The dialog shows the code, grouped for reading, the server URL, and the time left of the code's 10 minutes.
    Both have copy buttons.
  - An expired code shows as expired, with "New code".
  - `SYNC.md` §Inviting a device.
  - Implementation:
    - the addon turns the server's expiry into this device's clock by the engine's skew estimate;
    - opening the dialog issues the code; a failed issue shows why, with "New code" to try again;
    - the status view's "Sync now" now uses `onPress`, as other buttons do.
  Done when:
  - component tests: the countdown, expiry, and a new code;
  - Manual verify: Settings → Sync → Invite a device → a code with 10 minutes left; after they pass, it shows as
    expired;
  - `bun run check:push` green.
  Commit: Invite a device with a pairing code
  Depends on: 2

- [x] 4. List, revoke, and leave the space's devices
  Goal:
  - The page lists the space's devices (`cmd_sync_devices`): name, platform, last seen, and this device marked.
    Revoked devices are not listed.
  - "Remove" on another device revokes it (`cmd_sync_revoke_device`), after a confirmation that names it.
  - "Leave the space" detaches this device (`cmd_sync_detach`), after a confirmation.
    Its data stays, sync stops, and the device can join again.
  - Out of reach, the list shows the error with a retry.
  - `SYNC.md` §Devices and §Leaving a space.
  - Implementation:
    - the addon sends `isRevoked`, and the page leaves revoked devices out;
    - a file that left or was revoked shows that it is in no space, without its status or devices; item 5 adds its
      join;
    - after leaving, the runner's cycles fail as detached; main logs each, about once a minute, until a join.
  Done when:
  - component tests: the list, both confirmations, and the error;
  - Manual verify: Settings → Sync → Leave the space → confirm → the status says the device is in no space, and its
    decks stay;
  - `bun run check:push` green.
  Commit: List, revoke, and leave the space's devices
  Depends on: 2

- [x] 5. Join a space from Settings
  Goal:
  - "Join a space" asks for the server URL, the pairing code, and this device's name.
  - It shows the preview first (`cmd_sync_preview`): the space's name, its decks, cards, and reviews, and its size.
    The preview does not use the code; "Join" does (`cmd_sync_join`), then starts the runner.
  - What follows depends on the file:
    - untouched seed, or a file that was in this space: nothing to choose;
    - used: Add or Replace (`cmd_sync_import`);
      with known ids, the choice warns that this looks like a copy and recommends Replace;
      Replace confirms that this device's decks are deleted;
    - in another space: the engine refuses before the claim, and the message says to leave that space first.
  - A file waiting for Add or Replace shows the same choice on the page after a restart, until it is made.
  - A file that was revoked, or left, joins again through the same form.
  - `SYNC.md` §Joining a space and §Add or Replace.
  - Implementation:
    - `cmd_sync_join` returns the status with the mode, and a Settings join sends default seed settings, which only a
      blank database uses; `seedSettings` in `setup.ts` builds them for `seedDB` too;
    - creating, joining, and importing start the runner if needed and nudge it: none of them starts a cycle;
    - the flow is `JoinFlow` in `settings-sync-join.tsx`, and the choice `SyncImportChoice`, which the page also shows
      to a database still waiting for it;
    - the preview's size is the space's log; images are not counted.
  Done when:
  - component tests: each mode, the copy warning, the Replace confirmation, and the refusal;
  - Manual verify, with a second app on its own user data:
    - the second app → Settings → Sync → Join a space with a code from the first → the preview names the space;
      Join → Add → every deck shows on both apps;
    - a deck added on one app shows on the other within seconds;
    - a join of a space of a few thousand cards → the app stays usable during the download (question 2);
  - `bun run check:push` green.
  Commit: Join a space from Settings
  Depends on: 3

- [ ] 6. Join a space on first run
  Goal:
  - The setup screen offers "Start fresh", today's seed, and "Join existing".
  - "Join existing" reuses item 5's form and preview.
    It calls `cmd_sync_join` with the seed settings the screen builds: its language and color scheme, and the default
    learning and hotkey settings.
    The engine seeds the blank file and enrolls it in one transaction.
  - The screen then waits as question 4 decides.
  - `SYNC.md` §First run.
  - `INTERFACE-SETTINGS.md` §First Setup and `LEARNING-SETTINGS.md` point at `SYNC.md` for a join, whose starter
    content and learning settings come from the space.
  Done when:
  - component tests: both choices, the wait, and an error during it;
  - Manual verify: a new app → Join existing → a code from an app in the space → the setup screen waits, then the
    app opens on the space's decks;
  - `bun run check:push` green.
  Commit: Join a space on first run
  Depends on: 5

- [ ] 7. Explain why sync stopped
  Goal:
  - Each stop and hold shows a message and what the user can do:
    - clock skew: the clock is off by some minutes; once it is fixed, sync resumes on its own;
    - revoked or left: the device is in no space; "Join a space" opens item 5's form;
    - unknown device, or restored: the server was restored without this device; join again with a new code;
    - authoritative restore: the server was restored from a backup that replaces this device's data;
      changes since the backup are lost; "Continue" calls `cmd_sync_accept_restore` after a confirmation;
    - low disk: how much the download needs, and how much is free;
    - push refused: its code;
    - update required: update the app, and sync resumes from where it stopped;
    - corrupt envelope: data this app cannot read; the operator's `koloda-server drop-envelope <space> <seq>`, with
      the lane and seq; uploads go on;
    - over quota: the space is full; new changes wait, and deleting frees room;
    - push waiting for server time: until when;
    - any other error: its message; sync retries on its own.
  - `SYNC.md` §When sync stops.
  Done when:
  - component tests: each stop and hold renders its message and action;
  - Manual verify: stop the server → Sync now → the page says the server is out of reach and retries on its own;
    start it again → the status returns to idle;
  - `bun run check:push` green.
  Commit: Explain why sync stopped
  Depends on: 5

- [ ] 8. Show sync in the title bar
  Goal (per question 7):
  - While the file is in a space, `titlebar.tsx` shows a sync indicator: syncing, idle, or stopped.
  - Its tooltip gives the last sync, or the stop's short message.
  - Clicking it opens Settings → Sync.
  - A file in no space shows nothing.
  - `SYNC.md` §Status names the indicator.
  Done when:
  - component tests: each state, and nothing for a file in no space;
  - Manual verify: a file in a space → the title bar shows the indicator → click → Settings → Sync opens;
  - `bun run check:push` green.
  Commit: Show sync in the title bar
  Depends on: 7

## Outcome

