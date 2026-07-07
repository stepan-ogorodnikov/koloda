# Hotkeys

Covers the keyboard shortcut system: scopes, bindings, conflict resolution, configuration, and validation.
Does not cover specific hotkey actions.

## What is a Hotkey

A hotkey is a keyboard shortcut that triggers an action.
Each hotkey has a scope, one or more key bindings, and an action.
Hotkeys are organized by scope to control when they are active.

## Scopes

Hotkeys are grouped into scopes.
A scope determines when its hotkeys are active.

The following scopes exist:

- **form** — actions within form dialogs
- **ui** — interface-wide actions (focus management, tabs, sidebar, theme)
- **navigation** — route navigation
- **grades** — card grading actions
- **ai** — assistant chat actions

## Scope Activation

A scope must be enabled for its hotkeys to fire.
Scopes are enabled and disabled at runtime.

The **navigation** scope is enabled on app load and stays enabled unless explicitly disabled.
Other scopes are enabled by the component that uses them.
For example, the lesson view enables the **grades** scope while a lesson is open.
The assistant chat enables the **ai** scope while the AI panel is visible.

When a scope is disabled, its hotkeys are silently ignored.
They do not fire, even if the keys are pressed.

## Global vs Component-Registered

Some hotkeys are registered globally and work everywhere.
Others are registered in specific components and only work when that component is mounted.

**Global hotkeys** (registered once at app level):

- All **navigation** hotkeys
- Focus management hotkeys (focus next, focus previous)
- Tab switching hotkeys (next tab, previous tab)
- Toggle sidebar controls
- Toggle color scheme

**Component-registered hotkeys** (registered where they are used):

- **form** hotkeys — registered in form dialogs
- **grades** hotkeys — registered in the lesson view
- **ai** hotkeys — registered in the assistant chat

## Key Bindings

Each hotkey can have zero or more key bindings.
A hotkey with no bindings does nothing — it is not registered with the keyboard handler.

Key bindings use a modifier-plus-key format.
Supported modifiers:

- `Mod` — Ctrl on Windows/Linux, Cmd on macOS
- `Shift`
- `Alt`
- `Ctrl`

Single keys without modifiers are also valid.

## Conflict Resolution

Hotkey conflicts occur when two hotkeys share the same key binding.

### Within a Scope

Duplicate key bindings within the same scope are not allowed.
If the user tries to assign the same key to two hotkeys in the same scope, validation fails.

### Across Scopes

The **ui** scope has special status.
If a **ui** hotkey shares a binding with a hotkey in any other scope, both hotkeys are marked as conflicting.
The conflict is reported as a validation error.

Non-UI scopes can share bindings with each other without conflict.
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

- The hotkey's scope
- The hotkey's action
- Which hotkeys exist

### Validation on Save

When the user saves hotkey settings, the configuration is validated:

1. No duplicate bindings within any scope
2. No binding in a non-UI scope conflicts with a UI binding
3. All hotkey names are valid (unknown names are rejected)

If validation fails, the save is rejected and the user sees an error.

### Default Bindings

Each hotkey ships with a default binding.
Some hotkeys have no default binding and must be configured by the user to be usable.

## Persistence

Hotkey settings are saved to the database.
They persist across sessions.

If the stored settings are invalid (corrupted data, missing keys), the defaults are used.
The invalid settings are replaced with defaults silently.

## Edge Cases

- If a scope is enabled multiple times, it stays enabled — enabling is idempotent
- If a scope is disabled while its hotkeys are mid-keystroke, the action completes — only future presses are blocked
- The user can assign the same key to hotkeys in different non-UI scopes — only the active scope's hotkey fires
- On save failure, the in-memory state reverts to the last saved state
- Hotkeys do not fire when a text input or textarea is focused, unless explicitly designed to ignore input focus
