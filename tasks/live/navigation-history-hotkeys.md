# Electron navigation history hotkeys

Status: ready

## Intent

Electron users can go back and forward in app history with fixed browser-like shortcuts.
The web app keeps native browser history.
The shortcuts are documented as non-configurable.

Done when the Electron desktop app navigates history with the fixed chords below, the web app does not register them, and the hotkey spec says so.

## Scope

In:

- Shared history helper used by the titlebar back and forward buttons
- Electron hotkey registration for those same actions
- `docs/specs/HOTKEYS.md`

Out:

- Remappable hotkeys
- Registering the shortcuts on web
- The timestamp display formats PR
- Inventing browser chrome
- Backspace-as-back

## Open questions

- [x] Which hosts register the shortcuts? — Electron only; web leaves history to the browser
- [x] Which chords? — Back: Mod+[ and Alt+ArrowLeft. Forward: Mod+] and Alt+ArrowRight. Mod is Cmd on macOS and Ctrl on Windows and Linux
- [x] Are they customizable? — No. They stay outside Settings → Hotkeys and outside the Rust/TS hotkey settings twin

## Plan

- [x] 1. Extract router history navigation for reuse
  Goal: Extract the back/forward + forward-stack logic from TitlebarNavigation into a reusable helper/hook so titlebar buttons and the new hotkeys share one behavior.
  Constraints: Keep UI of TitlebarNavigation looking the same; no behavior change for buttons; prefer colocating near the titlebar/navigation code that already owns this.
  Done when: TitlebarNavigation uses the shared helper; focused tests cover back/forward stack behavior if practical; existing titlebar still works.
  Commit: Extract router history navigation for reuse
  Depends on: none

- [ ] 2. Add back and forward navigation hotkeys for electron app
  Goal: Register hardcoded Electron-only hotkeys for back/forward using the shared helper. Gate so web builds never register them. Ignore text-field focus. Chords: Mod+[ / Mod+] and Alt+ArrowLeft / Alt+ArrowRight.
  Constraints: Do not add keys to hotkeys settings schema or ADD-HOTKEY flow. Do not change web. Find the existing pattern for host-gated or Electron-only UI (titlebar is Electron-only already) and mirror it.
  Done when: Pressing those chords on Electron navigates history like the titlebar buttons; they do nothing / are not registered on web; typing in inputs is unaffected.
  Commit: Add back and forward navigation hotkeys for electron app
  Depends on: 1

- [ ] 3. Document back and forward navigation hotkeys
  Goal: Update docs/specs/HOTKEYS.md (and INDEX/pointers only if required) to document these as non-configurable Electron-only history shortcuts mirroring browser defaults; web uses the browser. Call out chords and that they are outside Settings → Hotkeys.
  Constraints: Spec-level clarity; match tone of the existing zoom / lesson dialog exceptions in HOTKEYS.md.
  Done when: Spec states Electron chords, non-configurable, web unchanged, and relationship to titlebar navigation.
  Commit: Document back and forward navigation hotkeys
  Depends on: 2

## Outcome
