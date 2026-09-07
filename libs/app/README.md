# @koloda/app

Framework-agnostic app foundation: shared error codes, the app-shell settings schemas (interface / learning / hotkeys), conversation DTOs, locale helpers, and generic utilities.
No React, no DB drivers, no domain scheduling.

## Where it sits

Consumed by nearly every lib and app.
Depends on nothing; the settings registry that composes these schemas with ai's lives in `@koloda/settings`.
Desktop mirrors live in `crates/koloda-core/src/domain/` (settings, hotkeys, conversations, errors).

## Architectural Map

- Errors: `error.ts` — `AppError`, `throwKnownError`, and the Lingui error-code catalog (`db.*`, `validation.*`, `ai.*`, `not-found.*`). The AIError→AppError bridge lives in `@koloda/ai`'s `./app-error` subpath.
- Settings slices: `settings-interface.ts`, `settings-learning.ts`, `settings-hotkeys.ts` — defaults, labels, zod validation.
- Conversations: `conversations.ts` — `Conversation` / `ConversationListItem` types and active-conversation `localStorage` helpers.
- Environment: `environment.ts` — `getAppPlatform()`, `LOCALES`, `getLanguageCode()`.
- Shared shapes: `db.ts` (`Timestamps`), `utility.ts` (`DeepPartial`, `deepMerge`, form helpers, id helpers).

### Does NOT own (prevent scope creep)

- React UI or TanStack Query — `@koloda/app-react`, `@koloda/core-react`
- SRS domain / FSRS — `@koloda/srs`
- Persistence schema or repos — `@koloda/db-pglite`, `koloda-core`
- Provider HTTP or error bridging — `@koloda/ai`
- The settings registry — `@koloda/settings`

## Read next

- `agents/ADD-HOTKEY.md` — hotkey schema changes (TS + Rust)
- `agents/DB.md` — settings and conversation tables
- `docs/specs/HOTKEYS.md` — hotkey behavior
- `agents/ADD-AI-PROVIDER.md` — AI settings slice when adding a provider
