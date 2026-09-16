# Adding a New Hotkey

**Input REQUIRED from user**: category, key, translations, action, runtime scope, default binding

**Critical**: You MUST determine the category AND the runtime scope. They are different things
(docs/specs/HOTKEYS.md): the category organizes settings/validation/persistence, the runtime
scope (`navigation` | `grades` | `form` | always-on) gates whether the hotkey fires.
`ui`/`ai` categories have no runtime scope — their hotkeys register always-on and gate via
mount plus per-hotkey `enabled`. Don't assume global.

## Category-Specific vs Global

1. **Category-specific** (e.g., `ai`, `grades`): Handler lives in the component that uses it, not use-app-hotkeys.ts
2. **Global** (e.g., `navigation`, `ui`): Handler goes in use-app-hotkeys.ts

## Workflow

1. **Determine location and runtime scope**:
   - Ask user: "Does this hotkey apply globally or only in a specific component, and which runtime scope gates it (`navigation` | `grades` | `form` | always-on)?"
   - Global → use-app-hotkeys.ts
   - Specific → Find the component that renders when that runtime scope is active

2. **Add to settings schema** (`libs/app/src/lib/settings-hotkeys.ts`):
   - Add the category to HOTKEY_CATEGORY_LABELS
   - Add the key to HOTKEYS_LABELS under that category
   - Add the key to `hotkeys` object under the appropriate category
   - Add default in `DEFAULT_HOTKEYS_SETTINGS` (if needed)
   - Add to validation (ai category in hotkeysSettingsValidation)

3. **Add Rust validation** (`crates/koloda/src/domain/settings_hotkeys.rs`):
   - Add the key to corresponding `*_KEYS` constant
   - Add category field to HotkeysSettings struct
   - Add category to validate() iteration
   - Add category to ui hotkey duplicate check
   - Add category to fill_defaults()

4. **Add tests** (`libs/app/src/lib/settings-hotkeys.test.ts` and `crates/koloda/tests/domain/settings_hotkeys_tests.rs`):
   - Update first test case to include new category/key
   - Update the twin key-list pins in both files (must change together when a key is added)
   - Add test cases for new hotkey if needed

5. **Register handler** with a typed scope (`AppHotkeyScope` from `@koloda/core-react`):
    - **Global** → `libs/app-react/src/lib/hooks/use-app-hotkeys.ts`: useAppHotkey()
    - **Category-specific** → Component file that renders under the runtime scope: useHotkeysSettings() + useAppHotkey()

6. **Add translations**:
   - Follow agents/I18N.md to add translations to both apps
