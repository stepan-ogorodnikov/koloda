# Customizable timestamp display formats

Status: done

## Intent

The user can choose how timestamps render across the app.
Two new interface settings — a date format and a time format — each accept a preset
or a custom pattern, and every timestamp on screen follows them.
Done when: picking a preset or typing a valid custom pattern immediately changes how dates and times
render in the cards table, card details, review history, form created/updated labels, and chat message
times; the defaults reproduce today's locale-driven rendering exactly;
an invalid pattern is rejected on write and leaves the previous setting unchanged.

## Scope

In:

- Two interface settings fields: `dateFormat` and `timeFormat`, each `"locale"` sentinel or a date-fns pattern string
- Zod validation in `libs/app` plus the Rust mirror in `crates/koloda` (ADR 0001, one commit)
- One shared formatter + `useTimestampFormatter()` hook; two settings atoms and their hydration
- Migrating every hardcoded timestamp call site off its local `Intl.DateTimeFormatOptions`
- Interface settings screen controls: preset selects with an always-on preview; a date-only custom pattern field
- `docs/specs/INTERFACE-SETTINGS.md` update and en/ru message catalogs

Out:

- Relative timestamps ("3 days ago"); the conversation list's own relative labels stay as they are
- A timezone setting or any change to what instant a timestamp stores
- The local first-paint cache in `wire-ui-preferences.ts` (timestamps never render before data loads)
- DB schema or migration work — the settings row is JSON; serde/Zod defaults absorb old rows
- The `long` date preset — removed at the human's request
- E2E coverage in `apps/web-e2e` / `apps/electron-e2e`

## Open questions

- [x] Input style for the format fields — presets plus a custom field — presets + custom field (Recommended) picked;
  revised at review to a select with an always-on preview, the custom field (date only) shown only for the
  Custom option, and no custom option for time; at review the field moved into a wrapping row beside the
  select, the token cheat-sheet was dropped from the UI (the human may add it back later), and the preview
  shows the live current date/time instead of a fixed sample
- [x] `long` date preset — removed at the human's request; date presets are locale, ISO, dots, slashes
- [x] Defaults and Rust validator shape — both fields default to `locale`; Rust validates structurally
  (length + token whitelist), not with a full pattern engine — accepted with the design
- [x] Include chat message times (`message-timestamp.tsx`) in the migrated call sites? — migrate;
  it joins item 3 (answered at approval)
- [x] Separator between custom date and time patterns in `datetime` rendering? — a single space
  (answered at approval)

## Plan

- [x] 1. Add date and time format settings to interface settings
  Goal: Add `dateFormat` and `timeFormat` to the interface settings slice on both sides of ADR 0001.
  In `libs/app/src/lib/settings-interface.ts` add two fields: each accepts the literal `"locale"` or a
  custom pattern validated by a date-fns probe (non-empty, length cap, at least one real token; a pattern
  that throws in `format()` is invalid) with issue messages `validation.settings-interface.date-format`
  and `validation.settings-interface.time-format`; add both strings as keys to `ERROR_MESSAGES` in
  `libs/app/src/lib/error.ts`. In `crates/koloda/src/domain/settings_interface.rs` mirror both fields with
  `#[serde(default = ...)]` returning `"locale"`, and add `validate()` branches performing the structural
  check (length cap + allowed-token whitelist, no pattern engine) returning the same two codes; add the
  codes to `error_codes` in `crates/koloda/src/app/error.rs`. Follow exactly how the `motion` field was
  added on each side. Tests: extend the defaults, explicit-values, and `it.each` reject tables in
  `libs/app/src/lib/settings-interface.test.ts` (the existing exact-object assertions gain the two
  fields); add matching rows to `crates/koloda/tests/domain/settings_interface_tests.rs` (defaults,
  valid values, structural rejects per code); update the full-field fixture in
  `crates/koloda/tests/common/mod.rs` if it pins the complete JSON.
  Constraints: schema, error codes, and tests only — no formatter, no atoms, no UI, no call sites.
  The TS and Rust halves must stay in this one commit: `libs/app/src/lib/error-parity.test.ts` parses
  `error_codes` against `ERROR_MESSAGES` and fails if either side is missing.
  Done when: `bun run test:libs` passes, `bun run test:rust` passes, and `bunx nx run-many -t lint,typecheck` passes.
  Commit: Add date and time format settings
  Depends on: none

- [x] 2. Add shared settings-aware timestamp formatter
  Goal: One formatter replaces the per-site `Intl.DateTimeFormatOptions` scattered today.
  Add `libs/app/src/lib/timestamp-format.ts` exporting `formatTimestamp(date, kind, formats, locale)` where
  `kind` is `"date" | "datetime" | "time"` and `formats` is `{ dateFormat, timeFormat }` from the settings;
  wire it through `libs/app/src/index.ts`. The `"locale"` sentinel must reproduce today's rendering per kind
  (date-only sites keep numeric date, datetime sites keep long date + time, time sites keep clock time —
  match the current output of the call sites listed in item 3). Custom patterns render through date-fns
  `format` with the ru/enUS date-fns locale mapped from the lingui locale so `MMMM` localizes; `datetime`
  joins the rendered date part and time part with a single space. An invalid or
  throwing stored pattern falls back to the sentinel at render with a `// WHY:` comment (validation rejects
  these on write; the guard exists for hand-edited rows and must not silently swallow anything else).
  Add `dateFormatAtom` and `timeFormatAtom` to `libs/core-react/src/lib/atoms.ts`, hydrate both from the
  interface settings query in `libs/app-react/src/lib/hooks/use-global-sync.ts` (same pattern as `scheme`),
  and add `useTimestampFormatter()` in `libs/core-react/src/lib/hooks/` returning the bound formatter.
  Unit-test `formatTimestamp`: sentinel defaults per kind, each preset pattern, a custom pattern, Russian
  month localization, and the invalid-pattern fallback.
  Constraints: no call-site edits in this item — they move in item 3; no cache mirroring in
  `wire-ui-preferences.ts`; follow `agents/CODE-STYLE.md` (named `*Options`/`*Props` types, top-level
  `import type`) and `agents/CODE-DOCUMENTATION.md` (only tagged comments on the non-obvious traps).
  Done when: `bunx vitest run --config libs/app/vitest.config.mjs --configLoader runner timestamp-format`
  passes, `bun run test:libs` passes, and `bunx nx run-many -t lint,typecheck` passes.
  Commit: Add shared timestamp formatter
  Depends on: 1

- [x] 3. Render timestamp call sites through the shared formatter
  Goal: Delete every local `TIMESTAMP_OPTIONS` / `TIME_OPTIONS` / `DATE_TIME_OPTIONS` block and render
  through `useTimestampFormatter()` instead, preserving each site's current granularity:
  `libs/srs-react/src/lib/cards/cards-table-cell.tsx` (date), `libs/srs-react/src/lib/cards/card-details.tsx`
  (datetime), `libs/srs-react/src/lib/cards/card-reviews.tsx` (datetime),
  `libs/ui/src/lib/primitives/form/form.tsx` `CreatedAt`/`UpdatedAt` (match today's bare `i18n.date` output),
  and `libs/assistant-react/src/lib/ui/message-timestamp.tsx`
  (time/datetime; its "today" label logic stays, only the formatting moves). The conversation list's
  relative "ago" labels are Out and must not change.
  Constraints: no className, markup, or column changes; sorting is unaffected (the table sorts `Date`
  values, not strings); under default settings every site renders as it does today.
  Done when: `bun run test:libs` passes, `bunx nx run-many -t lint,typecheck` passes, and a manual pass
  shows identical rendering with defaults and changed rendering everywhere after switching the settings.
  Commit: Apply timestamp format settings to all call sites
  Depends on: 2

- [x] 4. Add date and time format controls to interface settings
  Goal: Surface both settings on the interface settings screen per `docs/specs/INTERFACE-SETTINGS.md`.
  In `libs/settings-react`, add two sections to `settings-interface.tsx`, each a theme-picker style
  `Select`: date offers Default / ISO / dots / slashes / Custom, time offers Default / 12-hour / 24-hour
  (no `long`). Picking Default or a preset saves that field immediately. The date select's Custom option adds a
  label-less pattern field (accessible name kept) to a wrapping row beside the select; it saves on blur or
  Enter only — invalid input shows the error and persists nothing. The field shows only for Custom, and time
  has no Custom option, so time shows neither. A live preview under each select is always visible and renders
  the current date and time through `formatTimestamp`. Each control saves only its own field via
  `patchSettingsMutation`; no save button. Add msgids in dot-kebab style
  (`settings.interface.date-format` etc.), run extract → translate (ru) → compile for web and electron-react
  per `agents/I18N.md`, and update `docs/specs/INTERFACE-SETTINGS.md`: two Core Model bullets plus a
  "Date and Time Format" section covering defaults, presets, custom pattern validity, rejection on write,
  and immediate effect — behavior only, one sentence per line (`agents/FUNCTIONAL-SPECIFICATIONS.md`,
  `agents/MARKDOWN.md`).
  Constraints: touch only the interface settings screen and its controls; leave other settings sections alone.
  Done when: `bun run test:libs` passes, both apps' lingui extract + compile succeed, and manual checks pass:
  picking a preset applies app-wide immediately, an invalid custom pattern never persists, and the preview
  matches what the app then renders.
  Commit: Add date and time format controls to interface settings
  Depends on: 1, 2

## Outcome

Two interface settings shipped: `dateFormat` (Default / ISO / dots / slashes / Custom) and
`timeFormat` (Default / 12-hour / 24-hour), each a select with an always-on preview that renders
the live current date/time through the shared formatter; the date-only Custom option reveals a
label-less pattern field (accessible name kept) in a wrapping row beside the select, which saves
on blur or Enter and shows the error without persisting invalid input. Validation lives in
`libs/app` (date-fns probe) with the structural mirror in `crates/koloda` (ADR 0001) and two
shared error codes; an invalid stored pattern falls back to the sentinel at render. One
`formatTimestamp()` plus `useTimestampFormatter()` and two atoms replaced the per-site
`Intl.DateTimeFormatOptions` in all five call sites (cards table, card details, review history,
form created/updated labels, chat message times), with defaults rendering as before. Spec
`docs/specs/INTERFACE-SETTINGS.md` updated and en/ru catalogs compiled for both apps. Token help
was dropped from the UI at review and may return later.
