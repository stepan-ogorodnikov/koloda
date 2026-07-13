# @koloda/app

Framework-agnostic app foundation: shared error codes, settings schemas, conversation DTOs, locale helpers, and generic utilities.
No React, no DB drivers, no domain scheduling.

## Where it sits

Consumed by nearly every lib and app.
Depends on almost nothing; re-exports AI settings validation from `@koloda/ai` where settings and AI profiles meet.
Desktop mirrors live in `crates/koloda-core/src/domain/` (settings, hotkeys, conversations, errors).

## Architectural Map

- Errors: `error.ts`, `error-ai.ts` — `AppError`, `throwKnownError`, and the Lingui error-code catalog (`db.*`, `validation.*`, `ai.*`, `not-found.*`).
- Settings registry: `settings.ts` — `allowedSettings` (`interface` / `learning` / `hotkeys` / `ai`), patch/set DTOs.
- Settings slices: `settings-interface.ts`, `settings-learning.ts`, `settings-hotkeys.ts` — defaults, labels, zod validation.
- Conversations: `conversations.ts` — `Conversation` / `ConversationListItem` types and active-conversation `localStorage` helpers.
- Environment: `environment.ts` — `getAppPlatform()`, `LOCALES`, `getLanguageCode()`.
- Shared shapes: `db.ts` (`Timestamps`), `utility.ts` (`DeepPartial`, `deepMerge`, form helpers, id helpers).

### Does NOT own (prevent scope creep)

- React UI or TanStack Query — `@koloda/app-react`, `@koloda/core-react`
- SRS domain / FSRS — `@koloda/srs`
- Persistence schema or repos — `@koloda/srs-pgsql`, `koloda-core`
- Provider HTTP — `@koloda/ai`

## Read next

- `agents/ADD-HOTKEY.md` — hotkey schema changes (TS + Rust)
- `agents/DB.md` — settings and conversation tables
- `docs/specs/HOTKEYS.md` — hotkey behavior
- `agents/ADD-AI-PROVIDER.md` — AI settings slice when adding a provider
