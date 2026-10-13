# Adding a New Hotkey

**Input REQUIRED from user**: category, action id (camelCase), label and its translations, default binding or none,
what the action does, and whether it must fire while a text field is focused.

Ask for anything missing before editing code.
The settings screen lists hotkeys from the label maps, so it needs no change.

## Category and Runtime Scope

They are different things: `docs/specs/HOTKEYS.md` (§Categories, §Runtime Scopes).
The category groups a hotkey for settings, validation, and persistence.
The runtime scope gates whether it fires.

| Category | Scope passed to `useAppHotkey` |
| --- | --- |
| `form` | `"form"` |
| `navigation` | `"navigation"` |
| `grades` | `"grades"` |
| `ui` | `""` (always on) |
| `ai` | `""` (always on) |

An always-on hotkey is gated by where its handler mounts and by its `enabled` option.

## Add a Hotkey to an Existing Category

1. **Spec**: add the row to the category's table in `docs/specs/HOTKEYS.md` (§Catalog).
2. **TS settings** (`libs/app/src/lib/settings-hotkeys.ts`):
   - Add the id to `hotkeys` under its category.
   - Add its label to `HOTKEYS_LABELS`, with the message id `settings.hotkeys.<category>.<kebab-case id>`.
   - Add its default to `DEFAULT_HOTKEYS_SETTINGS`; `[]` means no default.
   - Validation derives from `hotkeys`, so it needs no change.
3. **Rust** (`crates/koloda/src/domain/settings_hotkeys.rs`): add the id to the category's `*_KEYS` const.
   `fill_defaults()` drops ids that are not listed there.
4. **Tests**: the twin pins change together.
   - `RUST_HOTKEY_ACTION_IDS` in `libs/app/src/lib/settings-hotkeys.test.ts`.
   - `test_hotkeys_category_action_ids_match_ts` in `crates/koloda/tests/domain/settings_hotkeys_tests.rs`.
   - The expected object in the TS test "fills missing categories with empty hotkey arrays".
5. **Handler**: call `useAppHotkey(binding, callback, scope, options)` from `@koloda/core-react`.
   Read the binding from `useHotkeysSettings()`.
   - App-wide actions (navigation, focus, color scheme, language) go in
     `libs/app-react/src/lib/hooks/use-app-hotkeys.ts`.
   - A feature action goes in the component or hook that owns its state and is mounted only while it applies.
     Examples: `libs/assistant-react/src/lib/ui/use-assistant-chat-hotkeys.ts`,
     `libs/srs-react/src/lib/lessons/lesson-studying.tsx`.
   - Set `ignoreInputs: false` when the hotkey must fire while a text field is focused.
   - Set `enabled` when the action is available only in some states, such as a run being active.
   - Set `conflictBehavior: "allow"` only when both actions on a shared key should fire
     (`docs/specs/HOTKEYS.md` (§Conflict Behavior)).
6. **Translations**: the label lives in the `libs/app` catalogs; follow `agents/I18N.md`.
7. **Manual verify**: end with a block per `agents/VERIFY.md` that covers these paths:
   - Settings → Hotkeys shows the new row with its default binding.
   - Pressing the binding where the action applies has its effect.
   - Pressing it where it must not fire does nothing: another screen, a disabled scope, or a focused text field.

## Add a New Category

Do everything above, plus:

- **Spec**: add the category to §Categories and its table to §Catalog.
  If it needs activation gating, add its runtime scope to §Runtime Scopes and §Scope Activation.
- **TS settings**: add the category to `hotkeys`, `HOTKEY_CATEGORY_LABELS`, `HOTKEYS_LABELS`,
  the `hotkeysSettingsValidation` object, and `DEFAULT_HOTKEYS_SETTINGS`.
- **Rust**: add a `*_KEYS` const and a `#[serde(default)]` field on `HotkeysSettings`.
  Add the field to the per-category loop and the `ui` conflict chain in `validate()`, and to `fill_defaults()`.
- **Runtime scope**, when the category is gated:
  add it to `RuntimeScope` in `libs/core-react/src/lib/hooks/use-hotkeys-status.ts`.
  Call `enableScope` and `disableScope` where the feature mounts, as `libs/ui/src/lib/primitives/form/form.tsx` does.
- **Tests**: add the category to both twin pins and to the TS test's expected object.
