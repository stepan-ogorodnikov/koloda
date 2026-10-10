# Sync in the desktop app

Status: draft

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
- `docs/specs/SYNC.md`, new.
- `crates/koloda-sync/README.md`, which says no app calls the engine yet.
- `apps/electron-e2e`: one spec against a real server on loopback (question 5).

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

## Open questions

- [ ] 1. Area guides? — open
  - Proposed: `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`,
    `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md`, `agents/TESTING.md`, and `agents/RUST.md`.
  - For the new spec and screens: `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/I18N.md`, `agents/LAYOUT.md`, and
    `agents/CSS.md`.
  - `agents/VERIFY.md` for the manual checks, and `agents/REVIEW.md` for self-review.
  - Also `apps/electron/IPC.md`, `docs/decisions/APP-ROLES.md`, `crates/koloda-sync/README.md`, and
    `crates/koloda-sync-proto/PROTOCOL.md`.
  - The plan was drafted without the UI guides, so items may change once they are read.
- [ ] 2. Which thread runs the engine's host calls? — open
  - Every `Engine` call blocks until its network work is done.
    On the `koloda-db` worker, it would hold every read the UI makes behind the network.
  - Recommended: one more FIFO worker, `koloda-sync`, with the promise pattern of `KolodaDb::run`.
    The desktop never calls `sync_now`, since "Sync now" is a `nudge`, so no call on that worker runs a cycle.
    Status arrives by event, and `cmd_sync_status` reads it on demand.
  - Alternative: NAPI async tasks on the libuv pool.
    Calls may then overlap; the engine already runs one cycle at a time.
  - Either way the engine shares the app's `Database`.
    A bootstrap page holds the connection for one transaction, and UI reads wait behind it.
    Item 9's manual check looks at that on a space of a few thousand cards.
- [ ] 3. Where does the engine's `Starter` come from? — open
  - When no algorithm or template is live, repair creates one from `Starter`, title included.
  - Recommended: the renderer passes it in `cmd_sync_start`, built as `seedDB` builds the seed, with the translated
    title.
  - Alternative: main builds it from the `@koloda/srs` defaults; main has no i18n, so the title is not translated.
- [ ] 4. What does the first-run screen show while a blank file joins? — open
  - A blank joiner's database reads as set up once its settings are seeded, before any algorithm or template arrives.
  - Recommended: the setup screen stays until the first bootstrap leaves `Bootstrapping`.
    It shows progress and errors from the status, and the engine retries on its own.
    The only way out is quitting the app.
  - Alternative: the app opens at once and fills in.
    Forms that need an algorithm or a template fail until they arrive.
- [ ] 5. Does a test run two apps against a real server? — open
  - Recommended: yes, item 9, one `electron-e2e` spec.
    The e2e target builds `koloda-server`, and the spec runs `serve --insecure-http` on a loopback port.
    `check:push` does not run `electron-e2e`, so the item's `Done when` names `nx run electron-e2e:e2e`.
    `apps/web-e2e` gets no mirror, and the e2e README notes the exception.
  - Alternative: the manual checks only.
- [ ] 6. The spec in one item first, or with each item? — open
  - Recommended: each item writes the `SYNC.md` sections it makes true (`agents/IMPLEMENTATION-PLAN.md` §Sizing).
    This plan fixes the screens now, so approving it approves them.
  - Alternative: a docs-only item 1 with the whole spec, reviewed before any screen.
- [ ] 7. Does sync show outside Settings? — open
  - Recommended: a title bar indicator while the file is in a space (item 8).
    It shows syncing, idle with the last sync in its tooltip, and a stop that needs the user.
    Clicking it opens Settings → Sync.
  - Alternative: Settings only; a stopped sync goes unnoticed until the user looks there.

## Plan

- [ ] 1. Run the sync engine in the desktop app
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
  Constraints:
  - No change to `koloda-sync`, `koloda`, or the server.
  - The `koloda-db` FIFO invariant holds: sync queues nothing on that thread.
  - Quitting does not wait for a cycle; the protocol makes a lost reply safe.
  Done when:
  - `koloda-db.test.ts` passes with the new methods mirrored;
  - a main test: each `cmd_sync_*` handler calls its method, and events reach every window;
  - a renderer test: a `Changed` event for each kind invalidates its keys;
  - a Rust test in the addon for the error and status wire mapping;
  - manual: the app starts on a new file and on a used one, with no sync error in the console;
  - `bun run check:push` green.
  Commit:
  - a. Run the sync engine in the desktop app
  - b. Host the sync engine in the desktop addon and carry its events to the renderer
  - c. Start the sync engine with the desktop app
  Depends on: none

- [ ] 2. Create a sync space from Settings
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
  - `docs/specs/SYNC.md`: what sync is, the core model (server, space, device, pairing code), platform availability
    (absent on the web), creating a space, and status.
  Constraints:
  - The setup token is never stored; it goes to the server once.
  - The page follows the other settings pages' layout.
  Done when:
  - component tests: the form validates and submits; each state renders; the web's queries hide the link;
  - manual: against `koloda-server serve --insecure-http` on this machine, create a space;
    the status reaches idle, and `koloda-server spaces` lists the space;
  - `bun run check:push` green.
  Commit:
  - a. Create a sync space from Settings
  - b. Add Settings → Sync with space creation and status
  Depends on: 1

- [ ] 3. Invite a device with a pairing code
  Goal:
  - "Invite a device" on a file in a space calls `cmd_sync_issue_pairing`.
  - The dialog shows the code, grouped for reading, the server URL, and the time left of the code's 10 minutes.
    Both have copy buttons.
  - An expired code shows as expired, with "New code".
  - `SYNC.md` §Inviting a device.
  Done when:
  - component tests: the countdown, expiry, and a new code;
  - `bun run check:push` green.
  Commit:
  - a. Invite a device with a pairing code
  - b. Issue pairing codes from Settings → Sync
  Depends on: 2

- [ ] 4. List, revoke, and leave the space's devices
  Goal:
  - The page lists the space's devices (`cmd_sync_devices`): name, platform, last seen, and this device marked.
    Revoked devices are not listed.
  - "Remove" on another device revokes it (`cmd_sync_revoke_device`), after a confirmation that names it.
  - "Leave the space" detaches this device (`cmd_sync_detach`), after a confirmation.
    Its data stays, sync stops, and the device can join again.
  - Out of reach, the list shows the error with a retry.
  - `SYNC.md` §Devices and §Leaving a space.
  Done when:
  - component tests: the list, both confirmations, and the error;
  - manual: leave the space; the status says the device is in no space, and its decks stay;
  - `bun run check:push` green.
  Commit:
  - a. List, revoke, and leave the space's devices
  - b. Manage the space's devices from Settings → Sync
  Depends on: 2

- [ ] 5. Join a space from Settings
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
  Done when:
  - component tests: each mode, the copy warning, the Replace confirmation, and the refusal;
  - manual: a second app with its own user data joins item 2's space;
    Add of unrelated decks shows every deck on both apps;
  - `bun run check:push` green.
  Commit:
  - a. Join a space from Settings
  - b. Join a sync space, with Add or Replace for a used database
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
  Done when:
  - component tests: both choices, the wait, and an error during it;
  - manual: a new app joins item 2's space from the setup screen and opens on its decks;
  - `bun run check:push` green.
  Commit:
  - a. Join a space on first run
  - b. Offer Join existing on the setup screen
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
  - `bun run check:push` green.
  Commit:
  - a. Explain why sync stopped
  - b. Show each sync stop with what to do about it
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
  - `bun run check:push` green.
  Commit:
  - a. Show sync in the title bar
  - b. Add a sync indicator to the title bar
  Depends on: 7

- [ ] 9. Sync two desktop apps end to end
  Goal (per question 5):
  - The e2e target builds `koloda-server`.
  - A fixture runs `koloda-server init` and `serve --insecure-http` on a free loopback port with a fresh data dir.
    It reads the setup token from `init`, and stops the server after the test.
  - The spec:
    - app A starts fresh, creates a space, and issues a code;
    - app B, with its own user data, joins on first run;
    - a deck and a card with an image added on A show on B;
    - a grade on B reaches A;
    - A removes B, and B shows that it is in no space;
    - A leaves the space, so no token stays in the OS keyring.
  - `apps/electron-e2e/README.md` lists the spec, and notes that `web-e2e` has no mirror.
  Done when:
  - `nx run electron-e2e:e2e` passes;
  - manual: join a space of a few thousand cards; the UI stays usable during the download (question 2);
  - `bun run check:push` green.
  Commit:
  - a. Sync two desktop apps end to end
  - b. Test sync between two desktop apps against a real server
  Depends on: 6, 8

## Outcome

