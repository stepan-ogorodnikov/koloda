# Mobile spike

Status: draft
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, apps/electron/README.md, crates/koloda-sync/README.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/I18N.md, docs/decisions/APP-ROLES.md, docs/decisions/STORAGE-BUCKETS.md, docs/decisions/MEDIA-STORAGE.md, docs/specs/CARDS.md, docs/specs/MEDIA.md, docs/specs/LESSONS.md, docs/specs/SYNC.md, agents/DECISIONS.md, agents/MARKDOWN.md
Flow: local

## Intent

Decide whether the mobile app is built on React Native (Expo), with the UI drawn by native views.
The spike builds the smallest app that answers the questions that could still make that the wrong choice.

The candidate stack:

- Expo with the React Native New Architecture and Hermes, Expo Router with a native stack and native tabs.
- `koloda` and `koloda-sync` in-process, exported with UniFFI.
  uniffi-bindgen-react-native generates the JS bindings.
- The TypeScript domain libraries shared unchanged: `@koloda/srs`, `@koloda/app`, and `@koloda/core-react`'s
  query keys and types.

Tauri and other WebView shells are out: the desktop app already left Tauri because native WebViews were painful.
Fully native SwiftUI and Compose UIs are out for now: scheduling, the assistant, and markdown parsing would each need
a second implementation that synced devices must agree with.

Done when, on one iPhone and one mid-range Android phone:

- the app installs, starts fresh with the starter content, and keeps its data across a relaunch;
- a lesson runs with tap and swipe grading, haptics, and native transitions;
- the grade buttons show the same intervals as the desktop app for the same card;
- the phone joins a sync space from a desktop pairing code, and the library arrives, card images included;
- a review on either device shows on the other;
- the human has recorded a go or no-go verdict, with the measurements behind it;
- `docs/decisions/MOBILE-HOST.md` records the ruling.

Code falls into two kinds.
Kept code meets the repo's normal standards: tests, docs, and the guides above.
Spike code exists only to answer a question; it is listed in `apps/mobile/README.md` and replaced by the follow-up.

- Kept: the mobile builds of `koloda` and `koloda-sync`, the host secret stores, `apps/mobile/src-rust`, the Expo
  app setup, the generated bindings and their wiring, sync hosting, background ticks, and the card renderer.
- Spike code: the lesson screen, the sync screen, and debug screens.

## Scope

In:

- `koloda` and `koloda-sync` building for iOS and Android, with a host-provided secret store on both.
- `apps/mobile`: the Expo app, its Nx targets, its README, and its row in `docs/decisions/APP-ROLES.md`.
- `apps/mobile/src-rust`: the `koloda-mobile` crate, a thin UniFFI façade over `koloda` and `koloda-sync`.
- A native card markdown renderer with attachment images.
- A spike lesson screen and a spike sync screen.
- Sync in the foreground, and in the background through the engine's `tick`.
- Rows for the mobile host in `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` (§Persistence owners) and
  `docs/decisions/STORAGE-BUCKETS.md`, ridden with the items that make them true.
- `docs/decisions/MOBILE-HOST.md`.

Out:

- Settings screens, deck, card, and template editing, the assistant and AI, color themes, and a second locale.
- Typed answers: a type field behaves as reveal in the spike lesson.
- The lesson init screen: the spike lesson starts with the default amounts.
- Creating a space, inviting a device, the devices list, leaving a space, and Add or Replace for a used database.
- Metered-network handling and an image download policy.
- Hotkeys.
- Extracting a Rust host layer shared with `apps/electron/src-rust`.
  The spike copies what it needs and lists each copy in `apps/mobile/README.md`.
- Moving DOM-free logic out of the `*-react` libs, beyond the subpath exports items 5 and 6 add.
- Mobile builds in CI or in `bun run check:push`.
  Only the desktop-host Rust and TS gates cover the new code.
- Signing for release, store submission, and EAS.
- Any change to desktop or web behavior.

## Open questions

- [ ] 1. What is `apps/mobile`'s row in `docs/decisions/APP-ROLES.md` during the spike? — open.
  Proposal: Dev tool, since it ships nowhere and makes no durability promise.
  The follow-up that builds the real app makes it Product.
- [ ] 2. How does the mobile host store secrets? — open.
  Proposal: a host-provided store on both platforms, written in Swift over the Keychain and in Kotlin over the
  Android Keystore, and handed to `koloda` through a UniFFI callback interface.
  The alternative is the `keyring` crate on iOS plus a host store on Android only.
- [ ] 3. What does the mobile renderer do with raw HTML in card text? — open.
  Proposal for the spike: drop the tags and show their text.
  The lasting rule goes into `docs/specs/CARDS.md` (§Rendered Markdown) in the follow-up.
- [ ] 4. Does the background `tick` (item 8) stay in the spike? — open.
  Proposal: yes; it does not gate the verdict, so it can be cut if it stalls.
- [ ] 5. Which phones run the device checks? — open.
  At least one iPhone and one mid-range Android phone.
- [ ] 6. Which Mac builds the iOS app? — open.
  iOS builds need Xcode; a Linux session can build only Android.
- [ ] 7. What bar makes the verdict a go? — open.
  Proposal: the human judges the lesson screen as native-feeling on both phones.
  On the Android phone, with a release build, the app starts to the Lessons tab within 2 s.
  A swipe-to-grade stays at the display's frame rate in the performance monitor.

## Plan

- [ ] 1. Build koloda and koloda-sync for iOS and Android
  Goal: `koloda` and `koloda-sync` build for `aarch64-apple-ios`, `aarch64-apple-ios-sim`, and
  `aarch64-linux-android`.
  On those targets, `create_secret_store` in `crates/koloda/src/app/secrets.rs` returns the store a host registered.
  Add a registry for the host's store, with one register call taking an `Arc<dyn SecretStore>`.
  Until a host registers one, every secret call returns an `AppError` that says no secret store is set.
  The registry compiles on every target, so its tests run on the desktop host.
  Only `create_secret_store` chooses it, by `cfg(any(target_os = "ios", target_os = "android"))`.
  `keyring` is not linked on those targets.
  Fix any other dependency that fails to cross-build with the smallest feature change, and record each one in the
  item's commit body.
  Update `crates/koloda/README.md` where it says which secret store each platform uses.
  Constraints: Desktop targets build and behave as before, with no new dependency.
  Do not add the mobile targets to `rust-toolchain.toml`, since every machine and CI would then download them.
  Do not change `koloda-sync`'s behavior.
  Done when: Tests pin the registry: an unregistered store errors, and a registered one sets, gets, and removes a
  key.
  `cargo test -p koloda` and `cargo test -p koloda-sync` pass.
  `cargo ndk -t arm64-v8a build -p koloda -p koloda-sync` succeeds.
  On a Mac, `cargo build -p koloda -p koloda-sync` succeeds for both iOS targets.
  `bun run check:push` is green.
  Commit: Build koloda and koloda-sync for iOS and Android
  Depends on: none

- [ ] 2. Add the Expo mobile app shell
  Goal: Add `apps/mobile` (`@koloda/mobile`): an Expo app on the current SDK, with the New Architecture and Hermes.
  It runs as a development build through prebuild, not in Expo Go, because item 3 adds native code.
  Expo Router gives a native stack and native tabs: "Lessons" and "Sync", both placeholders for now.
  Metro resolves the workspace libs from source, as Vite does for the other apps.
  Lingui compiles macros through its Babel plugin, with an English catalog only, activated as the other apps do.
  `project.json` has `nx:run-commands` targets for `start`, `prebuild`, `ios`, `android`, and `typecheck`, with tags
  like the other apps'.
  Add the app to the root `tsconfig.json` references, so `bun run typecheck` covers it with React Native types and no
  DOM lib.
  A debug screen proves the shared domain code runs under Hermes.
  It builds the starter FSRS algorithm from `@koloda/srs` and shows the interval each grade gives a new card.
  Add `apps/mobile/README.md`: its role line pointing at `docs/decisions/APP-ROLES.md`, how to run it, a Spike code
  section that lists disposable files, a Copies section, and a Findings section.
  Add the app's row to `docs/decisions/APP-ROLES.md`, as open question 1 settles.
  Constraints: Mobile-only dependencies go in `apps/mobile/package.json`, not the root `package.json`.
  The app uses the workspace's React version.
  If the Expo SDK needs another one, stop and report it to the human.
  Do not change shared libs.
  If one fails to load under Hermes, record why under Findings and stop for the human.
  Done when: `bun run typecheck`, `bun run lint`, and `bun run check:workspace-deps` pass.
  Manual verify (human): the app boots on the iOS simulator and the Android emulator.
  Both tabs open, and the debug screen shows four intervals.
  Commit: Add the Expo mobile app shell
  Depends on: none

- [ ] 3. Call koloda from the mobile app through UniFFI
  Goal: Add `apps/mobile/src-rust`, crate `koloda-mobile`, as a Cargo workspace member.
  It is a thin façade over `koloda`, exported with UniFFI, like `apps/electron/src-rust` over NAPI.
  It opens `koloda.db` in the app's documents directory, reports its status, runs migrations, and seeds the starter
  content.
  It also lists decks and lessons, loads lesson data, and submits lesson results.
  Database calls run on one dedicated thread in call order and return Promises, as on desktop.
  Errors reach JS as the `AppError` shape `@koloda/app` defines.
  uniffi-bindgen-react-native generates the bindings.
  Commit its config; an Nx target regenerates the generated code, which is not committed unless the tool requires
  it.
  If the tool cannot give working async calls on both platforms, use an Expo module instead.
  That module is Swift and Kotlin over UniFFI's own Swift and Kotlin bindings; record the switch and why under
  Findings.
  The app implements the `Queries` methods it calls, typed as a `Pick` of `Queries` from `@koloda/core-react`, with
  its query keys.
  It does not set `queriesAtom`, whose contract check needs every method.
  The starter content mirrors what `apps/electron-react/src/app/setup.ts` builds; copy it and list it under Copies.
  The Lessons tab lists decks with due counts, as spike code.
  Add `apps/mobile/src-rust/**` to the inputs of `nx run koloda:lint`, so its clippy cache sees the crate.
  Add the mobile row to `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` (§Persistence owners): `koloda` over rusqlite,
  exposed through UniFFI.
  Constraints: No change to `koloda`'s behavior.
  Copy what the façade needs from `apps/electron/src-rust` instead of refactoring it, and list each copy under
  Copies.
  Done when: Rust tests on the desktop host open, migrate, and seed a temporary database through the façade and list
  its lessons.
  `cargo test -p koloda-mobile`, `nx run koloda:lint`, and `bun run typecheck` pass.
  `bun run check:push` is green.
  Manual verify (human, both platforms): a fresh install shows the starter decks with due counts.
  After force-quitting and reopening, the same decks show.
  Commit: Call koloda from the mobile app through UniFFI
  Depends on: 1, 2

- [ ] 4. Render card markdown natively on mobile
  Goal: Add a card markdown renderer under `apps/mobile/src/cards/` (kept code) that needs no DOM.
  It parses with the `marked` lexer, so its tokens match the desktop's parse.
  It renders the tokens as native components.
  Those are paragraphs, headings, emphasis, strong, inline and block code, lists, blockquotes, tables, links,
  images, rules, and line breaks.
  A card image (`ATTACHMENT_REF_PATTERN` from `@koloda/srs`) shows through `expo-image` from a cache file.
  `koloda-mobile` writes that file into the app's cache directory under the attachment's id, through `koloda`'s byte
  store.
  Behavior follows `docs/specs/MEDIA.md` (§Where Images Show) and `docs/specs/CARDS.md` (§Rendered Markdown).
  While an image loads, its place stays empty.
  A missing or unreadable image shows its alt text.
  A remote or `data:` image never loads, and its alt text shows instead.
  A web link opens in the system browser only when tapped.
  Raw HTML follows open question 3.
  Colors follow the system light or dark scheme.
  Add Jest with `jest-expo` and React Native Testing Library as `@koloda/mobile:test`, and add it to
  `bun run test:app-unit`.
  Classify the image cache files as device-local in `docs/decisions/STORAGE-BUCKETS.md`.
  Constraints: Do not change `libs/srs/src/lib/markdown.ts`.
  Done when: Tests cover each token kind.
  They also cover a card image resolving to its cache file, remote and `data:` images showing alt text, a missing
  image showing alt text, and the raw HTML rule.
  A Rust test writes an attachment's cache file and returns the same path on a second call.
  `bun run check:push` is green.
  Commit: Render card markdown natively on mobile
  Depends on: 3

- [ ] 5. Add a spike lesson screen on mobile
  Goal: Tapping a deck on the Lessons tab starts a lesson with the default amounts (spike code).
  The session runs on the existing lesson reducer, store, and selectors.
  Add a DOM-free subpath export, `@koloda/srs-react/lesson-state`, that re-exports them without moving files.
  If `@koloda/core-react`'s barrel does not load under Hermes, add a DOM-free subpath there as well, for
  `dispatchReducerAction` and `ReducerAction`, and record it under Findings.
  Each card shows its template's fields through the item 4 renderer, with display and reveal; type acts as reveal.
  Tapping the card or "Continue" submits it.
  The four grade buttons show their intervals, and swipes grade too.
  Swipes and the card transition run on the UI thread through Gesture Handler and Reanimated.
  Each grade gives haptic feedback.
  Results are saved through `koloda-mobile`'s submit call, in the `LessonResultData` shape.
  A plain screen shows completion.
  Constraints: No spec change.
  The only change to `@koloda/srs-react` is the subpath export.
  Done when: `bun run test:libs` and `bun run typecheck` pass.
  `bun run check:push` is green.
  Manual verify (human, both phones): study ten cards with swipes and buttons.
  On a new card, "Good" shows the same interval as on desktop.
  After force-quitting and reopening, the deck's due count has dropped.
  The human records under Findings the cold start to the Lessons tab in a release build, the swipe frame rate in the
  performance monitor on the Android phone, and a feel verdict for each phone.
  Commit: Add a spike lesson screen on mobile
  Depends on: 4

- [ ] 6. Host the sync engine on mobile
  Goal: Implement the host secret store as open question 2 settles, and register it with `koloda` at startup.
  `koloda-mobile` hosts the `koloda-sync` engine as `apps/electron/src-rust/src/sync.rs` does.
  It starts the engine with the starter content and runs the runner in the foreground.
  It forwards engine events to JS through a UniFFI callback interface.
  Product writes tell it to sync.
  The runner stops when the app goes to the background and resumes on return, with a nudge.
  The device claims with platform `ios` or `android`.
  Expose the calls a join needs: preview, join, and status.
  The app refreshes the queries each synced kind feeds, as `apps/electron-react/src/app/sync-events.ts` does.
  Copy it and list it under Copies.
  Images the engine fetched refresh their cache files.
  Constraints: Secrets stay in Rust and the host store, and never reach JS.
  Do not change `koloda-sync`.
  Done when: Rust tests on the desktop host cover registering the host store before the engine starts.
  They also cover starting and stopping the engine through the façade, and an event reaching the callback.
  `bun run check:push` is green.
  Commit: Host the sync engine on mobile
  Depends on: 3

- [ ] 7. Add a spike sync screen on mobile
  Goal: The Sync tab joins a space (spike code).
  It asks for the server address, the pairing code, and the device name, which starts as the device's name.
  It shows the preview (space name and counts) as `docs/specs/SYNC.md` (§Joining a Space) describes, then joins.
  Afterwards it shows the sync status and how far behind each lane is.
  Only a database that holds just its starter content joins; any other is refused with a message.
  Constraints: No spec change.
  No create, invite, devices, leave, or Add or Replace.
  Done when: `bun run typecheck` passes and `bun run check:push` is green.
  Manual verify (human, both phones):
  - On desktop, issue a pairing code; on the phone, enter it, check the preview, and join.
    The desktop library arrives, and a card with an image shows that image in a lesson.
  - Grade a card on the phone; desktop shows its new due time after it syncs.
  - Grade a card on desktop; after the phone returns to the foreground, it shows the change.
  - Force-quit and reopen the phone app; it is still in the space, and the status is in sync.
  - Enter a wrong code; the screen says the code is wrong.
  Commit: Add a spike sync screen on mobile
  Depends on: 5, 6

- [ ] 8. Sync the mobile app in the background with tick
  Goal: iOS BGTaskScheduler and Android WorkManager run the engine's `tick` with a time budget.
  They call it through UniFFI's Swift and Kotlin bindings, without starting the JS runtime.
  A tick that reports `is_done: false` schedules another as soon as the OS allows.
  An Expo config plugin adds the background task identifiers and modes to `Info.plist` and the Android manifest.
  Constraints: One engine per database file: a tick never runs while the foreground runner runs.
  It uses the same database file and the same secret store.
  Done when: `bun run check:push` is green.
  Manual verify (human, both phones):
  - Grade a card on desktop.
  - Trigger a background run: on iOS through Xcode's simulated background fetch, on Android with
    `adb shell cmd jobscheduler run`.
  - Turn on airplane mode and open the app; the change is there.
  The human records the tick budget used and the result under Findings.
  Commit: Sync the mobile app in the background with tick
  Depends on: 7

- [ ] 9. Record the mobile host decision
  Goal: On a go verdict, write `docs/decisions/MOBILE-HOST.md` per `agents/DECISIONS.md`.
  Its Ruling: the mobile host is React Native on Expo, with `koloda` and `koloda-sync` in-process through UniFFI.
  The TypeScript domain libraries are shared, and the UI is native views.
  Its Rejected designs name WebView shells (Tauri, Capacitor) and fully native UIs, one line each with why.
  Add pointers from `agents/INDEX.md`.
  Restate the spike's findings in the task's Outcome, not in the decision.
  On a no-go verdict, stop and ask the human; this item is rewritten.
  Constraints: Docs only.
  Done when: `bun run check:workspace-deps` passes, which runs the docs tests.
  `bun run check:markdown` reports no long lines in the changed files.
  Commit: Record the mobile host decision
  Depends on: 5, 7

## Outcome

Not started.
