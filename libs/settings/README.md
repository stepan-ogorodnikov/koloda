# @koloda/settings

The settings registry: maps each settings row name (`interface` / `learning` / `hotkeys` / `ai`) to its Zod schema, plus the row envelope schemas and the `SettingsName` / `AllowedSettings` / `SetSettingsData` / `PatchSettingsData` DTOs.

## Where it sits

A composition point above the domain libs — it must know every settings domain, so it imports app's shell schemas and ai's provider schema. Repos (`srs-pgsql`), the IPC contract (`native-ipc`), and the apps consume it to parse and validate settings rows.
Mirrors the settings rows in `crates/koloda-core` (settings repo); row names must stay in sync.

## Architectural Map

- Registry: `index.ts` — `allowedSettings`, `settingsRowEnvelopeSchema`, `settingsRowSchema`, DTO types.

### Does NOT own (prevent scope creep)

- The domain schemas themselves — interface/learning/hotkeys live in `@koloda/app`, AI profiles in `@koloda/ai`
- Settings persistence or repos — `@koloda/srs-pgsql`, `koloda-core`
- Settings UI — `@koloda/app-react`

## Read next

- `agents/ADD-HOTKEY.md` — hotkey schema changes (TS + Rust)
- `agents/DB.md` — settings tables
