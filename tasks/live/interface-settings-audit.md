# Interface settings audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/INTERFACE-SETTINGS.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/CSS.md, agents/I18N.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/ADD-COLOR-THEME.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, agents/VERIFY.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the interface settings audit as one task.

- The audit covered the behavior owned by `docs/specs/INTERFACE-SETTINGS.md`.
  That is language, color scheme, light and dark themes, motion, date and time formats, desktop zoom, the interface
  part of first setup, saving from the interface screen, and startup before the saved settings load.
  The audit report (`interface-settings.md` in the audit series) was written at `d32fb02e` (`main`).

This file restates every finding and its evidence, so neither the next session nor the archive reader needs the report.

Triage checked each finding again at `013fadf8`, where this task branches.
Since `d32fb02e`, the interface code changed only by moves and by other audit tasks:

- `wire-ui-preferences.ts` and `ui-preferences-cache.ts` moved from `libs/app-react` to `libs/settings-react`
  (`3df3b37a`), unchanged; the design system app is a third caller of `wireUiPreferences`.
- The web setup screen no longer renders `ColorSchemePicker`; only the desktop setup does.
- The lesson progress strip moved down the file (lessons-audit); its inner element is still ungated.
- `theme-boot.js` gained one header line, so its lines shifted by one or two.

The domain on both hosts, both repos, the spec, the theme files, the zoom hook, and the desktop window fallback are
unchanged.
Every finding holds.
Line numbers below are at `013fadf8`.

The report's verdict: the domain and persistence are in good shape.
TypeScript and Rust agree on every value set, default, and pattern rule, and both reject bad values before writing.
Startup paints the last-used look before CSS, and the four themes are complete.
The defects sit in the wiring between the screen, the atoms, and the stored row.

Done when, in user-visible terms:

- the app keeps the language chosen on this device after the saved settings load;
- Motion Off, or System with the device asking to reduce motion, stops every movement and looping indicator;
- quick successive interface changes on the web keep every field, as on the desktop;
- pressing the selected Scheme or Motion option does nothing and throws nothing;
- a failed interface write puts the control back and shows an error;
- a theme's override stays in that theme, and the first desktop launch shows GitHub colors;
- sideways Ctrl+wheel scrolling never zooms;
- the pattern rule, the registries, and the scheme and motion wiring have tests that fail without them;
- the interface e2e flows check themes, motion, formats, an invalid pattern, persistence across a reload, and that no
  page error was thrown;
- INTERFACE-SETTINGS.md lists where the formats apply and has one home per rule;
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

Entries use the report's numbers with the prefix `IS`.

### Spec violations

- IS1. Spec violation, Should-fix: the saved language overrides the language chosen on this device.
  Decision: fixed by item 3; the spec wins (question 2).
  - INTERFACE-SETTINGS.md §Language (lines 51-53): at startup the app uses the language last chosen on this device,
    otherwise the device language, otherwise English; the saved language does not override that choice.
    §Startup (line 182) repeats that language is the exception.
  - `useGlobalSync` sets the language atom from the saved row whenever the interface query returns
    (`libs/app-react/src/lib/hooks/use-global-sync.ts:47-49`).
    Its WHY says the opposite of the spec: "interface.language is the authoritative persisted locale".
  - The device's choice is the `lang` localStorage key, which both stores write on every language change
    (`apps/web/src/app/store.ts`, `apps/electron-react/src/app/store.ts`, `store.sub(langAtom, …)`) and both
    `i18n.ts` `getLanguage` read at boot.
  - History: the spec rule dates from `d06e5f21` (2026-08-23).
    The override came in `3641fe6b` (2026-09-16, "Persist interface language in electron app"), the same commit that
    made the desktop write and read `lang`; with `lang` in place, the override only matters when the two disagree.
  - They disagree after a failed language write (IS7), or when `lang` is cleared and the database kept.
    The app then starts in the device's language and flips to the saved one once the query loads.
  - `settings.interface` is device-local (STORAGE-BUCKETS.md), so no other device writes the row.
- IS2. Spec violation, Should-fix: Motion Off leaves several movements running.
  Decision: fixed by item 5; movement and looping indicators stop, brief fades and color changes stay (question 3).
  - §Core model, Relationships (line 34): "Motion applies to all interface animations at once."
    §Motion (lines 92, 96): Off suppresses interface animations; System suppresses them when the device asks.
  - Gated today: overlays, popovers, tooltips, tabs, and the toggle group use the `motion:` variant
    (`@custom-variant motion` in `libs/ui/src/lib/styles/global.css:126`); framer animations check `useMotionSetting`.
  - Not gated:
    - the lesson progress strip springs sideways on every card: the outer element checks `isMotionOn`, the inner one
      does not (`libs/srs-react/src/lib/lessons/lesson-progress-dots.tsx:63`, `:66-70`);
    - the narrow-layout drawer slides (`libs/ui/src/lib/layout/drawer.tsx:39`);
    - every switch thumb slides (`libs/ui/src/lib/primitives/form/switch.tsx:22`);
    - the slider thumb scales while dragged (`libs/ui/src/lib/primitives/form/slider.tsx:86`), while the same file
      gates the thumb's travel (`:93-97`);
    - the tool-activity chevron rotates (`libs/ai-react/src/lib/ai-tool-activity.tsx:252`);
    - looping indicators: the running-conversation dot pulses
      (`libs/assistant-react/src/lib/ui/assistant-conversations-list.tsx:144`), the hotkey recorder's placeholder
      pulses (`libs/ui/src/lib/ui/hotkey-recorder.tsx:47`, found at triage), and the three shimmer utilities loop
      (`libs/ui/src/lib/styles/utilities.css:138-172`; used by `ai-chat-message-status-pending.tsx:11` and
      `ai-tool-activity.tsx:36`, `:49`).
  - Opacity and color transitions (`animate-opacity`, `animate-colors`) are not gated; the spec did not say whether
    fades count, while the overlay fades are gated.
  - Scenario: with Motion Off, or reduced motion on the device, the lesson progress strip springs after every grade.
- IS3. Spec gap, Later: the formats reach places the spec does not list.
  Decision: fixed by item 12.
  - §Date and Time Format (lines 126-127) lists the cards table, card details, review history, form labels, and chat
    times.
  - The sync screens use the same formatter: device last seen, last sync, push resume time, and the title-bar
    indicator (`libs/settings-react/src/lib/sync/settings-sync-devices.tsx:24`, `settings-sync-status.tsx:23`,
    `settings-sync-problems.tsx:16`, `sync-indicator.tsx:35`).
  - The time format also sets the 12- or 24-hour cycle and hour padding of the learning screen's "Start of the day"
    field (`libs/settings-react/src/lib/settings-learning.tsx:89`, `timeFieldFormatOptions` in
    `libs/app/src/lib/timestamp-format.ts`).
    Neither this spec nor LEARNING-SETTINGS.md says so.
- IS4. Spec violation, Later: Ctrl with a sideways scroll zooms out.
  Decision: fixed by item 11.
  - §Desktop Zoom (line 143): the wheel zooms in when scrolling up and out when scrolling down.
  - `onWheel` zooms in for `deltaY < 0` and out otherwise (`apps/electron-react/src/app/use-electron-zoom.ts:39-43`).
    A wheel event with only `deltaX` (a sideways trackpad swipe, or Shift with the wheel) zooms out.
  - The hook has no test.

### Risks

- IS5. Risk, Should-fix: on the web, two overlapping interface writes lose one.
  Decision: fixed by item 1.
  - §Editing and Saving (lines 170-171): each control saves its own field; changing one field never rewrites others.
  - Web `patchSettings` reads, merges, and writes in three separate calls
    (`libs/db-sqlite/src/lib/settings.ts:48`, `:57-58`, `:61`).
    The sqlite lock is per call (`withSqliteLock`, `libs/db-sqlite/src/lib/db.ts:38-47`), so two patches can both read
    before either writes.
    `db.transaction` holds `BEGIN IMMEDIATE` for its whole body and runs a nested call inline
    (`db.ts:257-272`); `patchSettings` does not use it.
  - Audit probe: `{scheme: "dark"}` and `{motion: "off"}` sent together stored `{scheme: "system", motion: "off"}`,
    and both calls returned that row.
  - The screen then reverts itself: the scheme control writes the returned row into the query cache
    (`libs/settings-react/src/lib/settings-interface.tsx:30-31`), and `useGlobalSync` copies it into the atoms.
  - The desktop runs every data call on one FIFO worker (`apps/electron/src-rust/src/lib.rs`), so its
    `patch_settings` cannot interleave: a host difference that `host-desync.md` does not list.
  - Learning, hotkey, and AI patches share the same web function.
  - Trigger: two writes within one round trip, such as the toggle-scheme and toggle-language hotkeys back to back.
- IS6. Risk, Should-fix: pressing the selected Scheme or Motion option throws.
  Decision: fixed by item 2.
  - Both toggle groups take the first key of the new selection and call `toString()` on it
    (`settings-interface.tsx:42-45`, `:58-61`).
  - In single selection, react-aria clears the selection when the selected key is pressed again, unless the group sets
    `disallowEmptySelection` (`react-stately` `useToggleGroupState`, `toggleKey`).
    The two other toggle groups in the app set it (`assistant-settings-prompt-editor.tsx`,
    `settings-ai-profile-models.tsx`); these two do not.
  - Audit probe (real `SettingsInterface` in jsdom): pressing Light while Light is selected raised
    `TypeError: Cannot read properties of undefined (reading 'toString')`; nothing was written.
  - Both e2e cases start by pressing Light (`settings.spec.ts:22` web, `:21` desktop) while the seeded scheme is light
    (`libs/e2e/src/ui-flows.ts`, `applyPageDefaults`).
    They pass, because the control is controlled and Playwright does not fail on page errors.
- IS7. Risk, Later: a failed write is silent, and the screen keeps the unsaved value.
  Decision: fixed by item 4, with IS12.
  - §Editing and Saving (line 175): "A rejected or failed write leaves the previous settings unchanged."
  - Every interface control sets its atom first and then writes, with no `onError`; the query client has no mutation
    error handler (`libs/app-react/src/lib/app-providers.tsx`).
  - Audit probe: a rejected scheme write left the scheme on Dark and rendered no alert.
  - The device cache records the unsaved value (`persistCache` in `wire-ui-preferences.ts:86-95`, and `lang`), so the
    next start paints it before the saved row flips it back.
  - The stored row is unchanged, so the letter of line 175 holds; the screen does not show it.
  - Triggers: a failed web storage write, or a desktop Rust rejection the TS pick did not foresee, such as a theme
    registered only in TS (IS14).
- IS8. Risk, Later: the GitHub Dark fallback rule applies to every dark theme.
  Decision: fixed by item 6; Atom One Dark then takes the scheme's orange focus ring, like Atom One Light.
  - `libs/ui/src/lib/styles/themes/github-dark.css:1-2` doubles as the default fallback with `:root.dark`.
    That selector has the same specificity as `scheme-dark.css:1` and loads after it (`global.css:7-12`).
    So any token it sets beats the scheme in every dark theme that does not set it again.
  - One token leaks today: `--outline-focus-ring: var(--color-blue)` (`github-dark.css:15`).
    Atom One Dark does not set it, so it gets a blue ring, and the scheme's orange (`scheme-dark.css:16`) is dead in
    every dark theme.
  - The light fallback does not leak: bare `:root` in `github-light.css` is weaker than `:root:not(.dark)` in
    `scheme-light.css`, so Atom One Light keeps the scheme's orange ring (`scheme-light.css:18`).
  - ADD-COLOR-THEME.md step 5 tells the next author to override scheme tokens in the theme file; one added to GitHub
    Dark would apply to every dark theme.
- IS9. Risk, Later: the first desktop launch paints Atom One colors, then GitHub.
  Decision: fixed by item 7.
  - §Startup (lines 179-180): start with the last-used look, to avoid a flash of wrong colors.
  - With no `ui-prefs.json`, the window background and the Windows and Linux titlebar overlay use `#282c34` or
    `#fafafa`, with Atom One symbol colors `#abb2bf` and `#383a42` (`apps/electron/src/ui-prefs.ts:31-33`,
    `apps/electron/src/window.ts:20-33`).
  - The defaults are GitHub Light and GitHub Dark (`libs/app/src/lib/settings-interface.ts:97-100`).
    The boot script falls back to `#ffffff` and `#0d1117` (`libs/app-react/public/theme-boot.js:22-23`, `:36`).
    The GitHub symbol colors are `#1f2328` and `#f0f6fc` (`github-light.css:27`, `github-dark.css:26`).
  - `4d8d8de1` (2026-08-15, "Make github default theme pair") changed the defaults; this fallback kept the old pair.
  - Only the first launch, or a lost `ui-prefs.json`, shows it; the titlebar sends the real colors once it mounts.

### Improvements

- IS10. Improvement, Should-fix: the quote rule has no test that fails without it, on either host.
  Decision: fixed by item 8; an unclosed quote is valid and runs to the end (question 4).
  - TESTING.md §The survival question; §Write tests for ("test at the limit and one past it"); §The TS ↔ Rust twin
    rule.
    Spec: §Date and Time Format (lines 119-120).
  - The only quoted case is the reject row `"'noon'"` (`libs/app/src/lib/settings-interface.test.ts:52`, `:56`;
    `crates/koloda/tests/domain/settings_interface_tests.rs:168`, `:191`).
    Audit probe: with quote handling removed, `n` still fails the letter scan, so both rows still pass.
  - No case accepts a quoted literal or a `''` escape on either host; a broken quote rule would reject
    `"d 'of' MMMM"` unnoticed.
  - The 64-character limit is tested only one past it (65); 64 is not tested on either host.
  - An unclosed quote is accepted on both hosts and turns the rest into text: `"dd'MM"` renders `01MM` (audit probe).
    Line 119 speaks of text "wrapped in" quotes; nothing decided this case.
- IS11. Improvement, Later: the TS date-fns check rejects nothing the scan accepts.
  Decision: fixed by item 8; the check stays as a guard and both WHYs say so (question 5).
  - The TS WHY says the date-fns probe "catches what structure cannot, e.g. protected tokens"
    (`settings-interface.ts:54-60`).
    Protected tokens are `D` and `Y`, which the whitelist already rejects (`:52`).
  - Audit probe: date-fns renders every run of each whitelisted letter, 1 to 12 long, in `en` and `ru`, without
    throwing.
  - So the check at `:86-91` is unreachable today, and the Rust WHY describes a TS-only check that never fires
    (`crates/koloda/src/domain/settings_interface.rs:49-55`).
    The hosts agree in practice.
- IS12. Improvement, Later: seven write paths for one row, with two behaviors.
  Decision: fixed by item 4, with IS7.
  - The interface row is written from `settings-interface.tsx:29-34` (scheme, motion),
    `interface-controls/timestamp-format.tsx:56-61` and `:89`, `libs/app-react/src/lib/hooks/use-app-hotkeys.ts:24-47`
    (toggle hotkeys), `interface-controls/color-theme-picker.tsx:27`, `:40-41`, `language-picker.tsx:20`, `:32-33`,
    and `color-scheme-picker.tsx:24`, `:35`.
  - The first three put the returned row into the query cache; the theme and language pickers do not.
    None handles an error (IS7).
  - Each sets its atom and writes in its own handler, so a fix for IS7 would land in six places.
- IS13. Improvement, Later: test gaps across wiring, flows, and e2e.
  Decision: fixed by items 3, 4, 11, 13, and 14.
  - TESTING.md §Write tests for; §One home per behavior.
  - No unit test covers `wireUiPreferences` (System following the device, the cache), `useGlobalSync` (IS1's rule),
    `TimestampFormatSection`, `ColorThemePicker`, or `useElectronZoom`.
  - The motion rule is computed in three places with no test (`theme-boot.js:40`, `wire-ui-preferences.ts:66`,
    `libs/ui/src/lib/hooks/use-motion-settings.ts`).
  - e2e covers scheme and language only (`settings.spec.ts:9-43` web, `:10-41` desktop).
    It never picks a theme, motion, or a format, never reloads to check what persisted, and never enters an invalid
    custom pattern through the screen (§Date and Time Format, lines 129-130).
  - The desktop case says "Electron persists language in settings DB, not localStorage"
    (`apps/electron-e2e/src/settings.spec.ts:39`); the desktop store writes `lang` to localStorage.
  - The `interface-settings.md` e2e gaps are also input to the "e2e suites" audit concern; that audit should not
    re-raise what item 14 closes.
- IS14. Improvement, Later: nothing checks the TS and Rust registries against each other.
  Decision: fixed by item 10.
  - Five value sets and seven defaults are mirrored by hand (`settings-interface.ts:6-40`, `:94-110`;
    `settings_interface.rs:12-47`); ADD-COLOR-THEME.md step 7 is the only guard.
  - Each theme's surface color is written three times: `--color-bg`, `--titlebar-overlay-color`, and `SURFACE`
    (`theme-boot.js:8-13`).
  - A theme added only in TS would show in the picker; the desktop would reject the write (silently, until IS7).
  - `libs/app/src/lib/error-parity.test.ts` already parses Rust source for a TS ↔ Rust check, and TESTING.md names it
    an exemplar.
- IS15. Improvement, Later: residue in the interface code and docs.
  Decision: fixed by items 4 and 9.
  - `wireUiPreferences` takes an `options` bag that no caller passes
    (`libs/settings-react/src/lib/wire-ui-preferences.ts:15-29`).
    Search: `git grep -n "wireUiPreferences(" -- libs apps` finds the web, desktop, and design-system stores, each
    with one argument.
  - `ColorSchemePicker` defaults `isPersisted` to true, but its one caller passes false
    (`apps/electron-react/src/components/setup.tsx:85`), so its write branch and mutation are dead
    (`color-scheme-picker.tsx:16-24`, `:35`); item 4 removes them.
  - `Scheme`, `LightTheme`, and `DarkTheme` are keys of `Record<string, …>`, so each is `string`
    (`settings-interface.ts:21`, `:33-34`); they are used only in this file's casts.
  - `libs/app/README.md:22` places `LOCALES` and `getLanguageCode` in `environment.ts`; they are in
    `settings-interface.ts:11`, `:116`.
    `libs/settings-react/README.md:14` lists the interface controls without the date and time formats.
  - Rust tests: `test_missing_themes_default_to_github` (`settings_interface_tests.rs:21`) is a subset of
    `test_missing_fields_default_to_ts_twin` (`:35`).
    `test_settings_name_interface_validation_with_non_object_content` (`:210`) asserts no error code.
  - Found at triage, `hotkeys.md` finding 12's twin: `libs/core-react/src/lib/hooks/use-timestamp-formatter.ts:3`
    imports atoms from its own package entry, `@koloda/core-react`, which runs the index in a cycle and lets a module
    mock of the package replace them inside it.
    Item 9 fixes this file; `use-hotkeys-settings.ts:3` stays with the hotkeys triage.
- IS16. Spec hygiene, Later: INTERFACE-SETTINGS.md states some rules twice.
  Decision: fixed by item 12.
  - FUNCTIONAL-SPECIFICATIONS.md (§Principles, One home per rule).
  - The formats' default is stated three times: line 101, then lines 116 and 117.
  - "Only the date select also offers a custom pattern" (line 100) is repeated as "The time select has no Custom
    option, so time offers no pattern field" (line 124).

### Product decisions

The report raised three, for IS1, IS2, and IS10; they are questions 2-4.

### Overlaps

- `hotkeys.md` finding 12: item 9 fixes the `use-timestamp-formatter.ts` twin; the hotkeys triage keeps the rest.
- `hotkeys.md` findings 3 and 7 edit `hotkey-recorder.tsx`; item 5 changes only its placeholder's pulse class.
- `host-desync.md`: IS5 is a host difference that report does not list; item 1 closes it.
- The `libs/ui` package audit should not re-raise IS2 (drawer, switch, slider).
- The `apps/electron` package audit should not re-raise IS9 (`ui-prefs.ts`).

## Open questions

- [x] 1. Task shape? — the interface settings report alone, every finding fixed.
  IS5 changes the web write for every settings row; no other open task touches it.
- [x] 2. IS1: does the saved language ever win over the device's choice? — no; the spec stands and the override goes
  (human, 2026-10-31).
- [x] 3. IS2: what does Motion Off stop beyond movement? — looping indicators too (pulses and shimmers stand still);
  brief fades and color changes still play, and §Motion says so (human, 2026-10-31).
- [x] 4. IS10: is an unclosed quote valid? — yes; it runs to the end of the pattern, §Date and Time Format says so,
  and both hosts pin it with an accept row (human, 2026-10-31).
  Rejecting it would make a stored row with one fail to load, since both reads fail closed.
- [x] 5. IS11: drop the TS date-fns check or keep it? — keep it as a guard against a future date-fns version
  rejecting a pattern the scan accepts, so §Date and Time Format line 121 ("A pattern the app cannot render is
  invalid") stays enforced; reword both WHYs.
- [x] 6. IS7: where does a failed write show? — on the interface screen, one alert above the sections, cleared by the
  next successful write.
  The toggle hotkeys have no screen; they put the atom back, which is visible, and show nothing else.
- [x] 7. Plan approval — approved as drafted (human, 2026-10-31).

## Plan

`APP`, `UI`, `AR`, `SET`, `DB`, and `ER` below stand for
`bunx vitest run --config <dir>/vitest.config.mjs --configLoader runner`.
Their dirs are `libs/app`, `libs/ui`, `libs/app-react`, `libs/settings-react`, `libs/db-sqlite`, and
`apps/electron-react`.
`RS` stands for `cargo test -p koloda`.
Line numbers are at `013fadf8`; when an earlier item moved them, find the code by its text.

- [x] 1. Run web settings patches in one transaction
  Goal (IS5):
  - In `patchSettings` (`libs/db-sqlite/src/lib/settings.ts:46-66`), run the read, merge, write, and read-back inside
    `db.transaction(async (tx) => …)`, using `tx` for every call, as web setup does (`apps/web/src/app/setup.ts`).
    Add a WHY: the lock is per call, so a read and a write outside one transaction let a second patch interleave;
    the desktop serializes on its worker.
  - Integration test in `settings-reviews.integration.test.ts`: start `{scheme: "dark"}` and `{motion: "off"}` patches
    without awaiting between them, await both, then read the row: both fields are set.
    The test fails with the transaction removed.
  Constraints: `settings.ts` and its integration test; `setSettings` is one write and stays as is.
  Done when: `DB settings-reviews` passes; `bun run typecheck` passes.
  Manual verify: none — the race needs two writes inside one database round trip; the integration test pins it.
  Commit: Run web settings patches in one transaction
  Depends on: none

- [x] 2. Keep a Scheme or Motion option selected when pressed again
  Goal (IS6):
  - Set `disallowEmptySelection` on the Scheme and Motion `ToggleGroup`s (`settings-interface.tsx:40-47`, `:56-63`).
  - Component test (new `settings-interface.test.tsx`, real `SettingsInterface`, stub `patchSettingsMutation`):
    pressing the selected Light option leaves Light selected, sends no write, and throws nothing.
  Constraints: `settings-interface.tsx` and its new test.
  Done when: `SET settings-interface` passes; `bun run typecheck` passes.
  Manual verify:
  - Host: web.
  - Settings → Interface → with Light selected, press Light → it stays selected and the console shows no error.
  Commit: Keep a Scheme or Motion option selected when pressed again
  Depends on: none

- [x] 3. Keep the device's language when the saved settings load
  Goal (IS1):
  - Delete the language line and its WHY from `useGlobalSync` (`use-global-sync.ts:47-49`), and the setter it alone
    used.
    The saved language stays a record and the seed language; the boot read of `lang` decides the startup language.
  - Test in `libs/app-react`: with `langAtom` at `en` and a loaded interface row saying `ru`, the atom stays `en`.
    Fails with the deleted line restored.
  - INTERFACE-SETTINGS.md §Language and §Startup already say this; no spec change.
  Constraints: `use-global-sync.ts` and its new test.
  Done when: `AR use-global-sync` passes; `bun run typecheck` passes.
  Manual verify:
  - Host: web.
  - Settings → Interface → pick Русский → in devtools set `localStorage.lang` to `en` → reload → the app stays in
    English after the settings load.
  Commit: Keep the device's language when the saved settings load
  Depends on: none

- [x] 4. Write interface fields through one hook that undoes a failed write
  Goal (IS7, IS12, IS15's `ColorSchemePicker` bullet):
  - Add one hook in `libs/settings-react` (for example `useInterfaceSettingWrite`).
    Given a field and a value, it sets that field's atom, patches only that field, and puts the returned row in the
    `queryKeys.settings.detail("interface")` cache.
    On error it sets the atom back to the value it had before, unless a later write already changed it, and exposes
    the error.
  - Use it from every write site: the Scheme and Motion groups (`settings-interface.tsx`), `TimestampFormatSection`
    (`timestamp-format.tsx:56-61`, `:89`), `ColorThemePicker` (`color-theme-picker.tsx:27`, `:40-41`),
    `LanguagePicker` when `isPersisted` (`language-picker.tsx:20`, `:32-33`), and the toggle hotkeys
    (`use-app-hotkeys.ts:24-47`; compute the next value outside the atom updater).
  - `SettingsInterface` shows the last write error once, above its sections, with `ErrorMessage` in a `role="alert"`
    region and the app error's own message; the next successful write clears it (question 6).
    The hotkeys show nothing beyond the restored atom.
  - Drop `isPersisted`, the mutation, and the write branch from `ColorSchemePicker` (`color-scheme-picker.tsx:16-24`,
    `:35`); it only sets the atom, and the desktop setup stops passing `isPersisted={false}`.
  - Tests: the hook restores the atom and exposes the error on a rejected write, and leaves a newer value alone;
    `SettingsInterface` shows the alert on a rejected scheme write and clears it after a good one.
  Constraints: `libs/settings-react` interface controls and screen, `use-app-hotkeys.ts`, and
  `apps/electron-react/src/components/setup.tsx`; no new message ids unless the alert needs a label, and then both
  `en` and `ru` per `agents/I18N.md`.
  Done when: `SET` (interface tests), `AR` pass; `bun run typecheck` passes.
  Manual verify:
  - Host: web.
  - Settings → Interface → change the dark theme → reload → the choice stayed.
    A failure cannot be forced from the UI; the component tests pin it.
  Commit: Write interface fields through one hook that undoes a failed write
  Depends on: 2

- [x] 5. Stop every movement and looping indicator when Motion is off
  Goal (IS2):
  - Gate with the `motion:` variant: the drawer panel slide (`drawer.tsx:39`), the switch thumb (`switch.tsx:22`), the
    slider thumb scale (`slider.tsx:86`), and the tool-activity chevron (`ai-tool-activity.tsx:252`).
  - Give the inner progress strip (`lesson-progress-dots.tsx:66-70`) the same `isMotionOn` choice as its outer element:
    a spring when on, `{ duration: 0 }` when off.
  - Looping indicators stand still without `.motion`: the `animate-pulse` dot and placeholder
    (`assistant-conversations-list.tsx:144`, `hotkey-recorder.tsx:47`) and the three shimmer utilities
    (`utilities.css:138-172`).
    The stacked shimmer-icon highlight copy is hidden when still, so the solid icon shows alone.
  - `animate-opacity`, `animate-colors`, and other fades stay as they are.
  - INTERFACE-SETTINGS.md §Motion: Off stops movement (sliding, scaling, rotating, springs) and looping indicators;
    brief fades and color changes still play.
    §Core model line 34 points at §Motion instead of restating the rule.
  Constraints: class names and the one transition prop; no new motion hook; `agents/CSS.md` for class edits.
  Done when: `UI`, `SET`, and the `srs-react` lesson tests pass; `bun run typecheck` passes; a search of
  `libs/*/src` for `transition-transform`, `translate-`, `scale-`, `rotate-`, `animate-pulse`, and `animate-shimmer`
  finds none outside a `motion:` variant or a motion check, except where the element does not move.
  Manual verify:
  - Host: web.
  - Settings → Interface → Motion Off → toggle a switch → the thumb jumps; start a lesson and grade a card → the
    progress strip jumps; open the narrow-layout drawer → it appears without sliding.
  Commit: Stop every movement and looping indicator when Motion is off
  Depends on: none

- [x] 6. Keep GitHub Dark's tokens out of the other dark themes
  Goal (IS8):
  - Make both default fallback selectors weaker than the schemes, without dropping the fallback for an unknown theme
    id: `:where(:root.dark)` in `github-dark.css:1` and `:where(:root)` in `github-light.css`.
    The `[data-*-theme="github-*"]` selectors stay, so GitHub keeps its blue focus ring.
  - Atom One Dark then takes the scheme's orange focus ring, like Atom One Light; no new override.
  - ADD-COLOR-THEME.md step 1 says why the fallbacks use `:where`, and step 5 says an override goes on the theme's own
    selector.
  Constraints: the two GitHub theme files and ADD-COLOR-THEME.md.
  Done when: `bun run typecheck` and the `libs/ui` build pass.
  Manual verify:
  - Host: web.
  - Settings → Interface → Dark scheme, Atom One Dark → Tab to a button → the focus ring is orange; switch to GitHub
    Dark → it is blue.
  Commit: Keep GitHub Dark's tokens out of the other dark themes
  Depends on: none

- [x] 7. Paint the GitHub pair on the first desktop launch
  Goal (IS9):
  - `getDefaultSurfaceColor` (`apps/electron/src/ui-prefs.ts:31-33`) returns `#0d1117` or `#ffffff`, and the
    titlebar symbol fallback (`window.ts:31`) `#f0f6fc` or `#1f2328`.
  - A WHY names the twins: the registry defaults (`settings-interface.ts`), `theme-boot.js` `SURFACE`, and the
    GitHub theme files.
  Constraints: `ui-prefs.ts`, `window.ts`.
  Done when: `bun run typecheck` passes.
  Manual verify:
  - Host: desktop.
  - Delete `ui-prefs.json` from the app's user data → launch → the window and titlebar start in GitHub colors.
  Commit: Paint the GitHub pair on the first desktop launch
  Depends on: none

- [ ] 8. Pin the timestamp pattern rule with accept rows on both hosts
  Goal (IS10, IS11):
  - One accept table on each host: `"d 'of' MMMM"`, `"HH'h'mm"`, `"h:mm a ''"`, `"dd'MM"` (an unclosed quote runs to
    the end), and 64 `y`.
    TS in `settings-interface.test.ts`, Rust in `settings_interface_tests.rs`; each names its twin.
  - INTERFACE-SETTINGS.md §Date and Time Format: an unclosed quote turns the rest of the pattern into text.
  - Reword both WHYs (`settings-interface.ts:54-60`, `settings_interface.rs:49-55`): the TS date-fns check rejects
    nothing the scan accepts today; it guards against a date-fns version that would.
  Constraints: the two test files, the two WHYs, one spec sentence; no rule change.
  Done when: `APP settings-interface` and `RS --test domain settings_interface` pass, and deleting the quote branch
  of either scanner fails its accept rows (check by hand, then restore).
  Manual verify:
  - Host: web.
  - Settings → Interface → Date format Custom → type `d 'of' MMMM` → the preview reads like "1 of January" → save
    succeeds.
  Commit: Pin the timestamp pattern rule with accept rows on both hosts
  Depends on: none

- [ ] 9. Drop interface settings residue
  Goal (IS15, except `ColorSchemePicker`):
  - Drop `WireUiPreferencesOptions` and the `options` parameter (`wire-ui-preferences.ts:15-29`); read the cache or
    the defaults directly.
  - Drop `Scheme`, `LightTheme`, and `DarkTheme` (`settings-interface.ts:21`, `:33-34`) and the casts that use them.
  - `libs/app/README.md:22`: `LOCALES` and `getLanguageCode` live in `settings-interface.ts`.
    `libs/settings-react/README.md:14`: the interface controls include the date and time formats.
  - Rust: delete `test_missing_themes_default_to_github`; assert the error code in
    `test_settings_name_interface_validation_with_non_object_content`.
  - `use-timestamp-formatter.ts:3` imports the atoms from their module, not `@koloda/core-react`.
  Constraints: no behavior change.
  Done when: `APP`, `SET`, the `core-react` tests, and `RS --test domain settings_interface` pass;
  `bun run typecheck` passes.
  Manual verify: none — no behavior change.
  Commit: Drop interface settings residue
  Depends on: 4

- [ ] 10. Check the interface registries and theme surfaces against their twins
  Goal (IS14):
  - New `libs/app/src/lib/settings-interface-parity.test.ts` in the style of `error-parity.test.ts`: parse the
    languages, schemes, light and dark themes, and motion values, and the defaults, from
    `crates/koloda/src/domain/settings_interface.rs`, and compare them with the TS registries and
    `DEFAULT_INTERFACE_SETTINGS`.
  - In the same file, compare each theme file's `--color-bg` with its `--titlebar-overlay-color` and with
    `theme-boot.js` `SURFACE`, and check that `SURFACE` has every registered theme.
  - ADD-COLOR-THEME.md step 7 names the test.
  Constraints: test-only plus one guide line.
  Done when: `APP settings-interface-parity` passes, and removing a theme from either registry fails it (check by
  hand, then restore).
  Manual verify: none — test-only.
  Commit: Check the interface registries and theme surfaces against their twins
  Depends on: 9

- [ ] 11. Ignore sideways Ctrl+wheel scrolls in desktop zoom
  Goal (IS4):
  - In `onWheel` (`use-electron-zoom.ts:36-44`), return after `preventDefault` when `deltaY` is 0, so the zoom stays.
  - Test `use-electron-zoom.test.ts` (per-file jsdom environment): Ctrl with `deltaY` -1 zooms in, 1 zooms out, and
    `deltaX` only does neither.
  Constraints: the hook and its new test.
  Done when: `ER use-electron-zoom` passes; `bun run typecheck` passes.
  Manual verify:
  - Host: desktop.
  - Hold Ctrl and swipe sideways on a trackpad → the zoom does not change.
  Commit: Ignore sideways Ctrl+wheel scrolls in desktop zoom
  Depends on: none

- [ ] 12. List every timestamp under the interface formats and give each format rule one home
  Goal (IS3, IS16):
  - §Date and Time Format line 126: the formats apply to every timestamp, with the sync screens among the examples;
    relative labels stay excluded (line 131).
  - One sentence: the learning screen's "Start of the day" field takes its 12- or 24-hour cycle from the time format.
    LEARNING-SETTINGS.md does not restate it.
  - Drop lines 116-117 and the second half of line 100; keep line 101 and line 124.
  Constraints: INTERFACE-SETTINGS.md only.
  Done when: `bun run check:markdown` passes.
  Manual verify: none — spec only.
  Commit: List every timestamp under the interface formats and give each format rule one home
  Depends on: 5, 8

- [ ] 13. Unit-test the scheme and motion wiring
  Goal (IS13, unit part):
  - `wire-ui-preferences.test.ts` in `libs/settings-react`, with a stubbed `matchMedia`: System follows a device
    switch live, Light and Dark ignore it; Motion On, Off, and System against reduced motion set the `motion` class;
    the cache is written only once all four values are set.
  - `use-motion-settings` test in `libs/ui` for the same motion rule.
  Constraints: test-only.
  Done when: `SET wire-ui-preferences` and `UI use-motion-settings` pass.
  Manual verify: none — test-only.
  Commit: Unit-test the scheme and motion wiring
  Depends on: 9

- [ ] 14. Check interface settings by outcome in both e2e suites
  Goal (IS13, e2e part; IS6's mask):
  - Extend the interface case of `settings.spec.ts` on both hosts, with one shared flow in `libs/e2e` where the steps
    match.
    It picks a dark theme and Motion On; sets a custom date pattern; enters an invalid one and sees the error; reloads;
    and checks the theme attribute, the `motion` class, and the date select kept their values.
  - Collect `pageerror` events for the case and expect none at the end.
  - Delete the stale "Electron persists language in settings DB" comment (`apps/electron-e2e/src/settings.spec.ts:39`).
  Constraints: the two `settings.spec.ts` files and `libs/e2e`.
  Done when: `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck` pass.
  The e2e specs are typechecked only; the human runs both suites.
  Manual verify: none — the human runs both e2e suites.
  Commit: Check interface settings by outcome in both e2e suites
  Depends on: 2, 4

## Outcome

Pending.
