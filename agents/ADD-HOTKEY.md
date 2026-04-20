# Adding a New Hotkey

**Input REQUIRED from user**: scope, key, translations, action, **where** it applies (global vs specific component), default binding

**Critical**: You MUST determine WHERE the hotkey applies - global (use-app-hotkeys.ts) or scope-specific (component that uses it). Don't assume global.

## Scope-Specific vs Global

1. **Scope-specific** (e.g., `ai`, `grades`): Handler lives in the component that uses it, not use-app-hotkeys.ts
2. **Global** (e.g., `navigation`, `ui`): Handler goes in use-app-hotkeys.ts

## Workflow

1. **Determine location**:
   - Ask user: "Does this hotkey apply globally or only in a specific component?"
   - Global → use-app-hotkeys.ts
   - Specific → Find the component that renders when that scope is active

2. **Add to settings schema** (`libs/srs/src/lib/settings-hotkeys.ts`):
   - Add the scope to HOTKEY_SCOPE_LABELS
   - Add the key to HOTKEYS_LABELS under that scope
   - Add the key to `hotkeys` object under the appropriate scope
   - Add default in `DEFAULT_HOTKEYS_SETTINGS` (if needed)
   - Add to validation (ai scope in hotkeysSettingsValidation)

3. **Add Rust validation** (`apps/native-tauri/src-tauri/src/domain/settings_hotkeys.rs`):
   - Add the key to corresponding `*_KEYS` constant
   - Add scope field to HotkeysSettings struct
   - Add scope to validate() iteration
   - Add scope to ui hotkey duplicate check
   - Add scope to fill_defaults()

4. **Add tests** (`libs/srs/src/lib/settings-hotkeys.test.ts`):
   - Update first test case to include new scope/key
   - Add test cases for new hotkey if needed

5. **Register handler**:
   - **Global** → libs/react/src/lib/hooks/use-app-hotkeys.ts: useAppHotkey()
   - **Scope-specific** → Component file that uses the scope: useHotkeysSettings() + useAppHotkey()

6. **Add translations**:
   - Follow agents/I18N.md to add translations to both apps
  
