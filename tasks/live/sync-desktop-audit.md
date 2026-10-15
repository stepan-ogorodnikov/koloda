# Desktop sync audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/SYNC.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/I18N.md, agents/CSS.md, agents/VERIFY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, agents/BACKWARDS-COMPATIBILITY.md, agents/REVIEW.md, apps/electron/README.md, apps/electron/IPC.md, crates/koloda-sync/README.md, crates/koloda-sync-proto/PROTOCOL.md
Flow: local

## Intent

Settle every finding of the audit of desktop sync (`docs/specs/SYNC.md` and the code that implements it) at
`ad147702` (`main`).
Its report was `tmp/audits/sync-desktop.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.
The audit ran the settings-react (72 passed), electron (24), and electron-react (36) vitest suites and
`cargo test -p koloda-electron` (6); no e2e.
Its verdict: the screens follow `SYNC.md` closely, `IPC.md` §Sync matches the handlers, and the wire mirrors are
pinned from the Rust side.
No finding is Must-fix; the two Should-fix sit where an engine result meets the screen.

Done when:

- an image that downloads while its card is on screen replaces its alt text there;
- a stop because the server is out of reach reads in the interface's language, on Settings → Sync and in the
  title bar tooltip;
- Replace on a device another device removed while the choice waited keeps the device's data;
- a device waiting for Add or Replace can leave the space instead, and `SYNC.md` says so;
- a failed engine start shows its cause on Settings → Sync, and its retry starts the engine again;
- "Sync now", the focus and network nudges, and status reads do not wait behind a slow server call;
- the changes-waiting count includes changes held while the space is full;
- the title bar tooltip says why sync needs attention for Add or Replace, a held change, and a full space;
- the first-run download screen shows no language or color scheme picker;
- the first-run "Join a space" line says it needs a pairing code, in `en` and `ru`;
- the sync name form counts characters as the server does;
- `bun run check:push` is green, and the close-out has a desktop Manual verify block.

## Scope

In:

- `libs/settings-react/src/lib/sync/`: settings screen, status, indicator, forms, first-run join, and their tests.
- `libs/srs-react/src/lib/lessons/use-attachment-images.ts` and its test.
- `libs/core-react`: one atom for fetched images.
- `libs/app/src/lib/sync.ts`: the stop's TS twin.
- `apps/electron-react`: `sync-events.ts`, `use-sync-engine.ts`, `sync-queries.ts`, `store.ts`, `setup.tsx`,
  the locale catalogs, and tests.
- `apps/electron`: `src-rust/src/lib.rs` and `sync.rs`, `koloda-db.ts`, `sync-ipc.ts`, `IPC.md` §Sync.
- `crates/koloda-sync`: `status.rs` (one stop), `pairing.rs` (Replace), `cycle.rs` (one visibility), tests.
- `docs/specs/SYNC.md`: §When Sync Stops, §Add or Replace, §Joining a Space, §First Run, each with the item that
  makes it true.

Findings, numbered as in the report.
Line numbers are at `ad147702`.
Findings 11 and 12 were added or decided during triage (Open questions, 1).

- 1. Spec violation, Should-fix: an image that arrives while its card is shown stays as alt text.
  Decision: fixed by item 1.
  - On `attachmentsFetched`, the renderer invalidates `attachments.detail(id)`
    (`apps/electron-react/src/app/sync-events.ts:26-27`).
  - The only reader of that key is the lesson image cache.
    It loads with `queryClient.fetchQuery({ ..., gcTime: 0 })`
    (`libs/srs-react/src/lib/lessons/use-attachment-images.ts:21`), so no query stays cached and none is observed.
    Search: `grep -rn "getAttachmentQuery\|attachments.detail\|useAttachmentImages" libs/*/src apps/*/src` finds only
    that hook, the two `queries.ts` files, and `sync-events.ts`.
  - So the invalidation reaches nothing.
  - The hook has already replaced a missing image's `<img>` with its alt text (`use-attachment-images.ts:40`, `:43-45`).
    It re-runs only when the field's HTML changes (`:59`), and by then the `<img>` is gone from the DOM.
    So even a working signal finds no `<img>` to fill.
  - After a join, rows arrive before images (attachments run after the cycle's rounds), so a lesson started during a
    large image download shows alt text that never fills in.
  - Spec: `SYNC.md` §Status (line 200): "Screens that show synced data refresh as changes arrive."
    `IPC.md` §Sync (line 115): "`attachmentsFetched` `{ ids }` — these images arrived."
  - Mocked until green: `sync-events.test.ts:57-66` seeds both attachment keys with `setQueryData`, a cache entry the
    app never holds.
- 2. Spec violation, Later: the status undercounts changes waiting to upload while the space is full.
  Decision: fixed by item 7.
  - Writes the space refused for quota move from the outbox to `sync_held`.
    `pending` counts only `sync_outbox`, and `held` counts `sync_held`
    (`crates/koloda/src/repo/sync/outbox.rs:270-277`, `:301-308`).
  - The addon sends `held` (`apps/electron/src-rust/src/sync.rs:386`, `:404`), and `libs/app/src/lib/sync.ts:78` types
    it, but no screen reads it.
    `settings-sync-status.tsx:24`, `:45` show `pending` alone.
  - Spec: `SYNC.md` §Status (line 179): "how many changes wait to upload".
    §When Sync Stops (line 234): "The space is full: new changes wait to upload".
- 3. Spec violation, Later: the first-run "Join a space" line does not say it needs a code.
  Decision: fixed by item 10.
  - `apps/electron-react/src/components/setup.tsx:68` shows `app.setup.join-message`.
  - `apps/electron-react/locales/en/messages.po:34-35`: "Connect to existing database".
  - `ru/messages.po:34-35`: "База данных на сервере" ("Database on the server"), a different meaning.
    Neither says a code is needed.
  - Spec: `SYNC.md` §First Run (line 119): "'Join a space' needs a code from a device already in the space, and its
    line says so."
- 4. Spec violation, Later: the indicator's tooltip does not say why for Add or Replace, a held change, or a full
  space.
  Decision: fixed by item 8.
  - The tooltip uses the stop message, or else `settings.sync.indicator.attention`
    (`libs/settings-react/src/lib/sync/sync-indicator.tsx:45-46`).
  - Only a stopped state has a stop message.
    The other three attention cases (`:29-31`) get the generic "Sync needs your attention. Open Sync settings."
  - `sync-indicator.test.tsx` pins the generic label for all three (its `names the state of` table).
  - Spec: `SYNC.md` §Status (line 186): "Its tooltip gives the last sync, or why sync needs attention".
- 5. Spec violation, Later: a language or color scheme chosen on the first-run download screen is lost.
  Decision: fixed by item 9; hide the pickers once the join succeeds, do not persist them.
  - The join seeds the interface settings from the atoms at the moment of the join
    (`apps/electron-react/src/app/sync-queries.ts:38`, `setup.ts:30-36`).
  - The first-run screen keeps both pickers, unpersisted, below the frame through the download
    (`setup.tsx:76-79`, outside the `isJoining` branch at `:50`).
  - A change there sets only the atom.
    When the app opens, `useGlobalSync` sets the atoms from the stored settings
    (`libs/app-react/src/lib/hooks/use-global-sync.ts:39-49`), which reverts it.
  - Spec: `SYNC.md` §First Run (line 124): "The language and color scheme chosen on the first-run screen become its
    interface settings".
  - Why hide: interface settings are seeded once, then each device's diverge.
    `docs/decisions/STORAGE-BUCKETS.md:17`: `settings.interface` is "Device-local, except a one-shot pairing hint to a
    new device".
    The join is that one shot; a picker after it offers a change the seed no longer takes.
- 6. Risk, Later: quick local calls wait behind network calls on the one sync worker.
  Decision: fixed by item 6.
  - Every sync host call queues on one FIFO worker (`apps/electron/src-rust/src/lib.rs:135`, `:169-175`).
    That includes `sync_status`, which only reads the database, and `sync_nudge`, which only fires a trigger
    (`lib.rs:810-823`; `sync.rs:272-276`).
  - Network host calls retry 4 times (`crates/koloda-sync/src/client.rs:23`, `:95`).
    Each attempt can wait up to 15 s to connect or 120 s for a reply (`transport.rs:28-29`).
    So a server that drops packets holds the worker about 60 s per call; one that never answers, up to 8 minutes.
  - Settings → Sync loads the device list on mount, and again on each return to the window once it is 60 s old
    (`settings-sync-devices.tsx:25`; `libs/app-react/src/lib/app-providers.tsx:62`).
  - Meanwhile "Sync now", the focus and network nudges (`use-sync-engine.ts:30-32`), and status refreshes wait.
  - Spec: `SYNC.md` §Status (line 191): "'Sync now' syncs at once"; also "when the network returns".
- 7. Risk, Later: a failed engine start is dropped, and nothing can recover it.
  Decision: fixed by item 5.
  - `apps/electron-react/src/app/use-sync-engine.ts:22-27` calls `cmd_sync_start` with no rejection handler.
  - If `Engine::start` fails (secret store, HTTP client, runtime; `sync.rs:157-182`), the error is an unhandled
    rejection in the renderer's console.
  - Every later sync call fails with `unknown`: "the sync engine has not started" (`sync.rs:256-263`).
  - Settings → Sync shows that through `QueryState`, whose retry only calls `cmd_sync_status` again
    (`sync-queries.ts:9-12`).
    Nothing calls start again until a reload, and packaged builds block reloads (`apps/electron/README.md`, Window).
  - The addon already allows a retry: a failed `Engine::start` leaves the `engine` `OnceLock` empty.
- 8. Risk, Later: the form and the server count name length differently.
  Decision: fixed by item 11.
  - The form's rule is Zod `.max(100)` (`libs/settings-react/src/lib/sync/sync-forms.ts:4-10`), which counts UTF-16
    code units.
  - The server counts `chars()` (`crates/koloda-server/src/spaces.rs:193-195`); the form's comment calls the two
    twins (`sync-forms.ts:3`).
  - A name with characters outside the Basic Multilingual Plane, such as emoji, is refused below 100 characters,
    with a message that says 100.
    It is strict in the safe direction only.
  - Spec: `SYNC.md` §Creating a Space (line 56): "Each name has 1 to 100 characters".
- 9. Improvement, Should-fix: a stop for any other reason shows the engine's English diagnostic.
  Decision: fixed by item 2, with a narrower fix than the report's (Open questions, 3).
  - Every `SyncError` without a named stop becomes `Stop::Error(error.to_string())`
    (`crates/koloda-sync/src/status.rs:83`).
  - The addon sends only that text (`apps/electron/src-rust/src/sync.rs:451`, `:464`).
    The screen and the tooltip insert it into `settings.sync.stop.error`
    (`libs/settings-react/src/lib/sync/sync-messages.ts:54-57`, `sync-indicator.tsx:46`).
  - The texts are developer-facing English: "no reply from the sync server: …", "the sync server answered 500
    Internal: …" (`crates/koloda-sync/src/error.rs:104-146`).
  - A server out of reach (`SyncError::Transport`), the commonest stop for a laptop, lands here.
    So the `ru` interface shows English with HTTP statuses.
  - The report proposed carrying the addon's `sync.*` code (`sync.rs:344-378`) on the stop.
    That cannot work as written: the stop holds only the text, so the addon has no `SyncError` to map, and
    `SyncError` is neither `Clone` nor `Eq` (`error.rs:8`), which `Stop` derives.
  - Spec: `SYNC.md` §When Sync Stops (line 223) asks only that "the message says what failed"; a quality gap.
- 10. Improvement, Later: no e2e test covers a sync flow.
  Decision: moved to a task of its own (Open questions, 2).
  - `ls apps/electron-e2e/src` lists no sync spec.
    The settings-react tests stub `SyncQueries`, the addon tests pin serde shapes, and the engine tests stop at the
    engine.
    So nothing runs renderer → IPC → addon → engine → server; finding 1 is a failure only such a path sees.
  - The audit's fix direction: one `apps/electron-e2e` spec that starts `koloda-server` on loopback, creates a space,
    joins a second user-data directory with a code, and checks the second device lists both devices and shows a card
    made on the first.
  - Why it is its own task:
    - the desktop suite has no secret-store seam, so sync tokens would land in the real OS keyring
      (`get_secret_store`, `sync.rs:164`; `KOLODA_E2E` changes only devtools, `apps/electron/src/window.ts:86`);
    - it needs a server launcher and two app instances, which the fixtures do not have (one launch per test,
      `apps/electron-e2e/src/fixtures.ts`);
    - agents do not run Playwright suites (`agents/VERIFY.md`), so nothing in this task's gate would check it.
- 11. Product decision, Later: a device waiting for Add or Replace cannot leave the space.
  Decision: offer Leave beside the choice; fixed by item 4.
  - In the `importPending` state, Settings → Sync renders only `SyncImportChoice`
    (`libs/settings-react/src/lib/sync/settings-sync.tsx:53`), which offers Add and Replace.
  - Every way on either uploads the device's data to the space (Add, then leave) or deletes it (Replace).
    A restart shows the choice again (§Add or Replace, last line), and the indicator shows "needs attention" until a
    pick.
  - The engine already supports leaving there.
    `detach` (`crates/koloda-sync/src/devices.rs:69-101`) revokes the device and marks the file detached, with no
    check for a pending import.
    The status shows a detached file before a pending choice (`status.rs:136-145`), so the screen moves to the left
    state and offers Join.
    A waiting file pushed nothing (`cycle.rs:43-46`), so none of its data is in the space.
    A later join judges a file still in `import_pending` by its rows (`PROTOCOL.md` §Joining), so it is asked again.
  - Spec: `SYNC.md` §Add or Replace (line 135): the device "syncs nothing until the user picks"; nothing on leaving.
    §Joining a Space (line 102) says a device that "left or was removed" joins again with its data, which a device
    that left while the choice waited does not.
- 12. Risk, Later: Replace deletes the file's data before it learns the device was removed.
  Decision: fixed by item 3.
  Added during triage; the code is in the engine, outside the audit's scope, and no test reproduces it yet.
  - A device waiting for Add or Replace makes no server call:
    - its cycle returns before any request (`crates/koloda-sync/src/cycle.rs:43-46`);
    - the claim cleared the image queue with the other sync tables (`crates/koloda/src/repo/sync/join.rs:47-58`,
      `:126`), and `is_checking_attachments` starts at 0, so the image steps send nothing
      (`attachments.rs:31-37`, `:89-94`);
    - its events socket stays closed (`events.rs:153`).
  - So if another device removes it (`SYNC.md` §Devices), it does not learn of it while the choice waits.
  - Add reaches the server first: it probes (`pairing.rs:391-395`), the server answers `401 revoked`
    (`crates/koloda-server/src/auth.rs:167-174`), and `settle_device` detaches the file with its rows kept
    (`engine.rs:288-306`, through `run` at `:234-243`).
  - Replace is local only (`pairing.rs:397`).
    It deletes decks, cards, reviews, templates, and algorithms, then marks the file active and bootstrapping
    (`join.rs:193-201`, `:206-218`, `:235-240`).
  - The addon then asks for a cycle (`apps/electron/src-rust/src/sync.rs:217`).
    Its first request gets `401 revoked`, and the file detaches (`engine.rs:358-359`) before anything downloads.
  - The file ends out of the space with none of its own data and none of the space's.
  - Spec: `SYNC.md` §Add or Replace (line 138): Replace "takes the space's instead".
    §Devices (line 159): a removed device "keeps its data".
    Here it gets neither; the input is uncommon, so a Risk.

Out:

- Finding 10's e2e spec, moved to a task of its own (Open questions, 2).
- A secret-store seam for the desktop e2e suite; that task's first question.
- Translating every other unnamed stop by its own code; item 2 names the commonest only (Open questions, 3).
- The web host: it does not sync.

## Open questions

- [x] 1. Triage? — the human, 2026-10-15.
  Fix every finding as the report recommends, with these decisions:
  5, hide the pickers once the join succeeds (interface settings seed and diverge);
  11, offer Leave beside the choice;
  12, added from the walk through 11, and fixed.
- [x] 2. Finding 10: its own task, not an item here? — its own task, as recommended (human, 2026-10-15).
  It needs a keyring seam, a server launcher, and two app instances (Scope, finding 10).
  Only a human runs the suite, so this task's gate would not check it.
- [x] 3. Finding 9: a named stop for a server out of reach, not a code on every stop? — yes, as recommended (human,
  2026-10-15).
  The report's code-on-the-stop cannot work as written (Scope, finding 9).
  A server out of reach is the stop users meet; it gets its own engine stop and a translated message.
  Every other unnamed stop shows a translated line, with the engine's text as details on Settings → Sync only.
  Carrying a classified cause for all of them would add an engine-side classification the host mirrors.
  That is more surface than the remaining rare stops earn.
- [x] 4. Flow? — `local` (human, 2026-10-15).

## Plan

- [x] 1. Show an image that arrives while its card is on screen
  Goal (finding 1):
  - Add an atom to `libs/core-react` holding the ids of the latest `attachmentsFetched` batch, a new value per batch.
  - `applySyncEvent` (`apps/electron-react/src/app/sync-events.ts:26-27`) sets it instead of invalidating
    `attachments.detail`.
    `useSyncEngine` passes it a setter or the jotai store beside the query client.
  - `useAttachmentImages` (`libs/srs-react/src/lib/lessons/use-attachment-images.ts`) keeps each `<img>` it replaced
    with alt text, with the node that replaced it.
    When a batch names one of those ids, it puts the `<img>` back and acquires it again.
    The cache does not keep a missing image (`attachment-image-cache.ts:44-47`), so the new acquire reads the database.
  - Keep the existing behavior otherwise: no broken-image icon, and a still-missing image shows its alt text again.
  Constraints:
  - Do not reset the container's `innerHTML`; React owns it through `dangerouslySetInnerHTML`.
  - No change to the addon, the engine, or the IPC event's shape.
  - Drop the dead `attachments.detail` invalidation and its seeded-cache test (`sync-events.test.ts:57-66`).
    Before removing `queryKeys.attachments.detail`, search for other readers.
  Done when:
  - a `use-attachment-images.test.tsx` case: a field whose image is missing shows its alt text.
    The query then returns content, the atom gets that id, and the field shows an `<img>` with a `src`;
  - a case: a batch naming another id leaves the alt text;
  - a `sync-events.test.ts` case: `attachmentsFetched` sets the atom to its ids;
  - `bunx vitest run --config libs/srs-react/vitest.config.mjs --configLoader runner` and the same for
    `apps/electron-react` pass;
  - `bun run check:push` green.
  Commit: Show an image that arrives while its card is on screen
  Depends on: none

- [x] 2. Name an unreachable server as its own sync stop
  Goal (finding 9, per question 3):
  - `crates/koloda-sync/src/status.rs`: add `Stop::Unreachable`, and map `SyncError::Transport` to it in `Stop::of`
    (`:72-85`).
    Every other unnamed error stays `Stop::Error(String)`.
  - The addon: `StopWire::Unreachable` (`apps/electron/src-rust/src/sync.rs:442-466`), and a row in the stop table
    test (`sync.rs:548-629`).
    Its fixture `Stop::Error("no reply")` (`:588`) becomes `Stop::Unreachable`; keep one `Stop::Error` row.
  - `libs/app/src/lib/sync.ts:4-12`: add `{ reason: "unreachable" }` to `SyncStop`.
  - `sync-messages.ts:24-61`: `unreachable` gets a translated message, for example "The sync server can't be
    reached. Sync tries again on its own."
    `error` gets a translated line without the engine's text, for example "Sync stopped because of an error."
  - Settings → Sync shows the engine's text for `error` as details under that line, as `ErrorMessage` shows details.
    The title bar tooltip shows the line only.
  - `docs/specs/SYNC.md` §When Sync Stops (line 223): a bullet of its own for a server out of reach, which retries on
    its own.
    "Anything else" says the message says sync stopped and Settings → Sync shows what failed.
  Constraints:
  - Keep `Stop` `Clone + Eq`; carry no `SyncError` in it.
  - Waiting stops and the runner backoff are unchanged.
  - Add the new message ids to the `en` and `ru` catalogs (`agents/I18N.md`).
  Done when:
  - a `koloda-sync` status test: a cycle with no reply shows `Stopped(Unreachable)`;
    `status_tests.rs:135` still matches `Stop::Error` for an error that is not a transport error, or moves to one;
  - the `sync.rs` stop table pins `{"reason":"unreachable"}`;
  - settings-react tests: the unreachable stop's message, and an `error` stop showing its line on the indicator and
    its text as details on Settings → Sync;
  - `cargo test -p koloda-sync`, `cargo test -p koloda-electron`, and the settings-react vitest suite pass;
  - `bun run check:push` green.
  Commit: Name an unreachable server as its own sync stop
  Depends on: none

- [x] 3. Confirm the device with the server before Replace deletes rows
  Goal (finding 12):
  - In `import` (`crates/koloda-sync/src/pairing.rs:389-399`), the `Replace` arm makes one authenticated call before
    `replace_with_space`.
    Use the device-record `GET` the cycle already makes (`device_record`, `cycle.rs:237-251`), made `pub(crate)`.
  - A removed device then gets `401 revoked`; `run`'s `settle_device` detaches the file with its rows kept
    (`engine.rs:234-243`, `:288-306`), as Add's probe already does.
  - A server out of reach fails Replace before anything is deleted; the choice stays.
  Constraints:
  - Add is unchanged: its probe already reaches the server.
  - No server or protocol change; `PROTOCOL.md` §Joining says Replace is "one local transaction", which stays true
    of the deletion.
  Done when:
  - an `import_tests.rs` test: a device waiting for the choice is revoked by another device, then picks Replace.
    The call fails `Revoked`, the device's decks and cards are still there, and the status shows `Stopped(Revoked)`;
  - a test: Replace with no reply from the server fails, deletes nothing, and the status still shows `ImportPending`;
  - `cargo test -p koloda-sync` passes;
  - `bun run check:push` green.
  Commit: Confirm the device with the server before Replace deletes rows
  Depends on: none

- [x] 4. Offer Leave while the Add or Replace choice waits
  Goal (finding 11):
  - `libs/settings-react/src/lib/sync/settings-sync.tsx:53`: render `SyncLeaveSpace` beside `SyncImportChoice` in the
    `importPending` branch.
    Hide it while the Replace confirmation shows, so one choice is on screen at a time.
  - `docs/specs/SYNC.md` §Add or Replace: the device can leave the space instead of choosing; nothing it holds reaches
    the space (§Leaving a Space).
  - §Joining a Space (line 102): the re-join bullet covers a device that was in the space.
    A device that left while the choice waited is asked again, as any device with data of its own.
  Constraints:
  - No engine or addon change: `detach` already works there (Scope, finding 11).
  - If hiding Leave during the confirmation needs state from `SyncImportChoice`, keep it inside that component rather
    than lifting it.
  Done when:
  - a `settings-sync.test.tsx` case: the `importPending` state offers Add, Replace, and Leave;
  - a case: leaving from that state calls `detachMutation` and shows the status it returns;
  - the settings-react vitest suite passes;
  - `bun run check:push` green.
  Commit: Offer Leave while the Add or Replace choice waits
  Depends on: none

- [x] 5. Show a failed sync start and retry it from the status
  Goal (finding 7):
  - The status query starts the engine while it has not started in this renderer.
    Its fetch calls `cmd_sync_start` until one succeeds, then `cmd_sync_status`
    (`apps/electron-react/src/app/sync-queries.ts:9-12`).
  - `useSyncEngine` (`use-sync-engine.ts:22-27`) fetches that query once the database status is known, instead of
    invoking start itself.
    A failure is then the query's error; Settings → Sync's `QueryState` shows it, and its retry starts again
    (`libs/app-react/src/lib/routes/_.settings.sync.tsx:38`).
  - The start needs the translated starter (`starterContent`, `setup.ts:18-24`).
    `createSyncQueries` takes it as it takes `getInterface` (`store.ts:50`).
  - `IPC.md` §Sync, `cmd_sync_start`: a call after a failed start tries the start again.
  Constraints:
  - Start no earlier than now: only once the database status is known.
  - No addon change: a failed `Engine::start` leaves the `OnceLock` empty, so the next call starts again
    (`apps/electron/src-rust/src/sync.rs:157-182`).
  Done when:
  - an electron-react test: `cmd_sync_start` rejects once, the status query shows that error, a refetch calls
    `cmd_sync_start` again and shows its status, and later fetches call `cmd_sync_status`;
  - the electron-react vitest suite passes;
  - `bun run check:push` green.
  Commit: Show a failed sync start and retry it from the status
  Depends on: none

- [x] 6. Keep sync nudges and status reads off the network worker
  Goal (finding 6):
  - `sync_nudge` (`apps/electron/src-rust/src/lib.rs:818-823`) becomes synchronous, as
    `cancel_algorithm_optimization` is for the same reason (`:369-378`).
    `koloda-db.ts:156` types it `void`.
  - `sync_status` (`:810-815`) queues on the database worker (`run`), not the sync worker.
    It only reads the database, and there it also sees every write queued before it.
  - The worker comment (`lib.rs:131-136`) and `IPC.md` §Sync say which calls stay on the sync worker.
  Constraints:
  - Every call that reaches the server stays on the sync worker, in order.
  - `sync_start` stays where it is: it starts the engine and the runner.
  Done when:
  - `sync-ipc.test.ts` still passes with `syncNudge` returning `undefined`;
  - `cargo test -p koloda-electron` and the electron vitest suite pass;
  - `bun run check:push` green.
  Commit: Keep sync nudges and status reads off the network worker
  Depends on: none

- [x] 7. Count held changes as waiting to upload
  Goal (finding 2):
  - `libs/settings-react/src/lib/sync/settings-sync-status.tsx:24`, `:45`: the changes-waiting line counts
    `pending + held`.
  Constraints:
  - No wire change: `held` already reaches the renderer.
  Done when:
  - a `settings-sync-status` test: `pending: 2, held: 3` shows 5 changes waiting; `pending: 0, held: 3` shows 3;
  - the settings-react vitest suite passes;
  - `bun run check:push` green.
  Commit: Count held changes as waiting to upload
  Depends on: none

- [x] 8. Say why sync needs attention in the indicator tooltip
  Goal (finding 4):
  - `sync-indicator.tsx:45-46`: when no stop message applies, the label names the reason.
    The Add or Replace choice: a short line, for example "Sync waits for you to choose Add or Replace."
    A held change: a short line, for example "Downloads wait at a change this app can't read. Open Sync settings."
    A full space: reuse `settings.sync.over-quota`.
  - Keep `settings.sync.indicator.attention` only if a case still uses it; otherwise remove it from both catalogs.
  Constraints:
  - A stop's message still wins over the others, as now.
  - Add new message ids to the `en` and `ru` catalogs.
  Done when:
  - the `names the state of` table in `sync-indicator.test.tsx` expects each of the three reasons;
  - the settings-react vitest suite passes;
  - `bun run check:push` green.
  Commit: Say why sync needs attention in the indicator tooltip
  Depends on: 2 (both edit the indicator's test table)

- [x] 9. Hide the first-run pickers once the join succeeds
  Goal (finding 5):
  - `SyncFirstRunJoin` reports a successful join upward, for example an `onJoined` prop called where `JoinFlow`'s
    `onDone` sets `hasJoined` (`libs/settings-react/src/lib/sync/sync-first-run-join.tsx:16-19`).
  - `apps/electron-react/src/components/setup.tsx:76-79` renders the two pickers only until then.
    They stay while the join form is filled in, since the join reads them.
  - `docs/specs/SYNC.md` §First Run (line 124): "chosen on the first-run screen before the join".
  Constraints:
  - Do not persist the pickers' values after the join; interface settings seed once, then diverge
    (`docs/decisions/STORAGE-BUCKETS.md:17`).
  Done when:
  - a `sync-first-run-join.test.tsx` case: the callback fires when the join succeeds, and not on cancel;
  - the settings-react and electron-react vitest suites pass;
  - `bun run check:push` green.
  Commit: Hide the first-run pickers once the join succeeds
  Depends on: none

- [x] 10. Say on first run that joining needs a pairing code
  Goal (finding 3):
  - `app.setup.join-message` in `apps/electron-react/locales/en/messages.po:34-35` and `ru/messages.po:34-35` says
    that joining needs a pairing code from a device already in the space.
    For example, en: "Use a pairing code from a device already in the space".
  Constraints:
  - Catalog text only; the id stays.
  Done when:
  - both catalogs carry the new text, and the `ru` text means the same as the `en`;
  - `bun run check:push` green.
  Commit: Say on first run that joining needs a pairing code
  Depends on: none

- [x] 11. Count sync names in characters, as the server does
  Goal (finding 8):
  - `libs/settings-react/src/lib/sync/sync-forms.ts:6-10`: the 100 limit counts code points, for example a
    refinement on `[...name].length`, with the same `validation.sync.name.too-long` message.
  Constraints:
  - Keep the trim and the minimum as they are.
  Done when:
  - a `sync-forms` test: 100 emoji pass, and 101 fail with `validation.sync.name.too-long`;
  - the settings-react vitest suite passes;
  - `bun run check:push` green.
  Commit: Count sync names in characters, as the server does
  Depends on: none

## Outcome

<what shipped>
