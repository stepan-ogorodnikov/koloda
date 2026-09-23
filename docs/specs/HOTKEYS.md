# Hotkeys

Covers the keyboard shortcut system: categories, scopes, bindings, conflict resolution, configuration, and validation.
Does not cover specific hotkey actions.

Desktop zoom (ctrl/cmd `+`/`-`/`0`, ctrl+wheel) intentionally lives outside this system:
it is not configurable, not scope-gated, and fires while text inputs are focused.

Lesson dialog keys (`Escape`, `Enter`, `Space`) also live outside this system:
they are not configurable and are not checked for conflicts.
They are gated to the open lesson dialog; see LESSONS.md (§Hotkeys).
Avoid binding a configurable hotkey to `Escape`, `Enter`, or `Space` when lessons are used.
When a configurable hotkey and a lesson system key share the same binding, both actions fire.

Electron history back and forward also live outside this system.
They are not configurable and they are not listed in Settings → Hotkeys.
They are not part of the navigation category.
Back is `Mod+[` and `Alt+ArrowLeft`.
Forward is `Mod+]` and `Alt+ArrowRight`.
`Mod` is Cmd on macOS and Ctrl on Windows and Linux.
Only the Electron desktop app registers them.
The web app keeps the browser's own history shortcuts.
They do not fire while a text input or textarea is focused.
They follow the same in-app history as the titlebar back and forward buttons.
They do not drive a separate desktop-window history.
If that direction has no history, the shortcut does nothing.
Backspace is not a history shortcut.

## What is a Hotkey

A hotkey is a keyboard shortcut that triggers an action.
Each hotkey belongs to a category and has one or more key bindings and an action.
Hotkeys that need activation gating also carry a runtime scope.

## Categories

Hotkeys are grouped into categories for settings, validation, and persistence.
A category never gates whether a hotkey fires.

The following categories exist:

- **form** — actions within form dialogs
- **ui** — interface-wide actions (focus management, tabs, sidebar, theme)
- **navigation** — route navigation
- **grades** — card grading actions
- **ai** — assistant chat actions

## Runtime Scopes

A runtime scope determines when its hotkeys are active, distinct from the settings category.
The following runtime scopes exist: `navigation`, `grades`, `form`.
The `ui` and `ai` categories have no runtime scope — their hotkeys register always-on
and gate via component mount plus per-hotkey `enabled` instead.

## Scope Activation

A runtime scope must be enabled for its hotkeys to fire.
Scopes are enabled and disabled at runtime.

The **navigation** scope is enabled on app load and stays enabled unless explicitly disabled.
The **grades** scope is enabled while a lesson is open.
The **form** scope is enabled while a form is mounted.

When a scope is disabled, its hotkeys are silently ignored.
They do not fire, even if the keys are pressed.
Enabling a scope that is already enabled leaves it enabled.
If a scope is disabled while one of its hotkeys is mid-keystroke, that action completes.
Only later presses are blocked.

## Key Bindings

Each hotkey can have zero or more key bindings.
A hotkey with no bindings does nothing.

Key bindings use a modifier-plus-key format.
Supported modifiers:

- `Mod` — Ctrl on Windows/Linux, Cmd on macOS
- `Shift`
- `Alt`
- `Ctrl`

Single keys without modifiers are also valid.

Hotkeys do not fire when a text input or textarea is focused, unless the hotkey is designed to ignore input focus.

## Conflict Resolution

Hotkey conflicts occur when two hotkeys share the same key binding.

### Within a Category

Duplicate key bindings within the same category are not allowed.
If the user tries to assign the same key to two hotkeys in the same category, validation fails.

### Across Categories

The **ui** category has special status.
If a **ui** hotkey shares a binding with a hotkey in any other category, both hotkeys are marked as conflicting.
The conflict is reported as a validation error.

Non-UI categories can share bindings with each other without conflict.
For example, a **navigation** hotkey and an **ai** hotkey can use the same key.
Only the one that fires first (based on scope activation order) will trigger.

### Conflict Behavior

Some hotkeys are registered with a conflict-allowing behavior.
These hotkeys can coexist with other hotkeys on the same key.
When the key is pressed, both hotkeys fire.

This is used for hotkeys that should work in specific contexts regardless of conflicts.
For example, tab switching hotkeys allow conflicts because they only fire when focus is in the right element.

## Configuration

Users can configure hotkey bindings in the settings panel.

### What Can Be Changed

- Add a new key binding to a hotkey
- Remove a key binding from a hotkey
- Change an existing key binding to a different key

### What Cannot Be Changed

- The hotkey's category
- The hotkey's action
- Which hotkeys exist

### Validation on Save

When the user saves hotkey settings, the configuration is validated:

1. No duplicate bindings within any category
2. No binding in a non-UI category conflicts with a UI binding
3. Unknown hotkey names are dropped and are not persisted

The save still succeeds after unknown names are dropped.
If duplicate-binding validation fails, the save is rejected and the user sees an error.

### Default Bindings

Each hotkey ships with a default binding.
Some hotkeys have no default binding and must be configured by the user to be usable.

## Persistence

Hotkey settings are saved to the database.
They persist across sessions.

If a save fails, the in-memory bindings revert to the last saved state.
If the stored settings are corrupted, both hosts report an error instead of silently falling back to defaults.
Corrupted settings must never look the same as missing settings.
Otherwise safety checks could pass when they should fail.

When stored settings contain unknown action names (for example a retired hotkey), those names are dropped.
Known actions and their bindings are kept.
Missing known actions are filled with no bindings.
