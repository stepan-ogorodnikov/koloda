# koloda-core Routing Guide

Routes common changes inside `crates/koloda-core` to the right files.
Crate layout, ownership boundaries, and "Does NOT own" live in `crates/koloda-core/README.md`.
This file only tells you where to start.

## Task routing table

| Task | Start here |
| --- | --- |
| Entity CRUD (new resource, or fields on an existing one) | `src/domain/<entity>.rs` + `src/repo/<entity>.rs` |
| Add or change a validation error code | `src/app/error.rs` (`error_codes`) + the domain `validate()` that returns it |
| Add or change a settings slice or field | `src/domain/settings_<name>.rs`, dispatched in `src/domain/settings.rs` |
| FSRS state bucketing in SQL | `src/repo/fsrs_sql.rs` |
| FSRS progress field bounds | `src/domain/progress.rs` |
| Daily-limit / review-totals policy | `src/domain/reviews.rs::calculate_todays_review_totals` |
| Review row writes | `src/repo/reviews.rs::insert_review` |
| Schema / migrations | `agents/DB.md` |
| AI provider enum / secrets redaction | `agents/ADD-AI-PROVIDER.md` |
| Hotkeys settings | `agents/ADD-HOTKEY.md` |
| Assistant chat persistence | `agents/ASSISTANT-CHAT-MAP.md` |

## Per-task notes

**Entity CRUD** — follow the chain end to end.

- Types and validation in `src/domain/<entity>.rs`.
- SQL and error wrapping in `src/repo/<entity>.rs`.
- Test pair: `tests/<entity>_tests.rs` (domain, no DB) and `tests/<entity>_integration_tests.rs` (repo).
  Larger entities split these by concern.
- Register the command in `apps/native-electron/src-rust/src/lib.rs`.
- Expose it as `ipcMain.handle("cmd_*", …)` in `apps/native-electron/src/main.ts` —
  the `#[napi]` method alone is not reachable from the renderer.
- TS reaches it via `invoke("cmd_*")` in `apps/native-electron-react/src/app/queries.ts`.

**Error codes** — add the const to `error_codes` in `src/app/error.rs`.

- Return it from domain validation, not from repo lookup misses.
- Keep the code string identical to the TS mirror in `libs/app/src/lib/error.ts` (`ErrorCode`).

**Settings slices** — a slice module owns its struct plus `validate()` (and `fill_defaults()` where defaults exist).

- `src/domain/settings.rs` holds the `SettingsName` variant and the arms in both `validate()` and `normalize()`.
- Storage is generic in `src/repo/settings.rs`; slices never touch SQL.
- Mirror the schema in `libs/app/src/lib/settings.ts` (`allowedSettings`).
- The hotkeys slice has a dedicated walkthrough: `agents/ADD-HOTKEY.md`.

**FSRS bucketing** — build every state predicate from the helpers in `src/repo/fsrs_sql.rs`
(`eq_new`, `in_learn`, `eq_review`, `in_all_tracked`).

- Do not inline state integers into lesson, review, or card queries.

**Progress bounds** — validators in `src/domain/progress.rs` take the caller's error code,
so card-progress and review namespaces stay distinct.

**Review totals policy** — `calculate_todays_review_totals` in `src/domain/reviews.rs` is pure.

- Keep it in sync with `calculateTodaysReviewTotals` in `libs/srs/src/lib/reviews.ts`.

**Review writes** — `insert_review` in `src/repo/reviews.rs` is the single write path (`pub(crate)`).

- Its only caller today is `submit_lesson_result` in `src/repo/lessons.rs`.
- A new writer goes through `insert_review` inside its own transaction, never fresh INSERT SQL.

## Non-negotiables

- `domain/` must not import `rusqlite`.
  SQL lives in `repo/` (plus the DB status probe in `app/init.rs`).
- `domain/` must not import `repo/`.
- Domain importing `crate::app::error` is intentional.
  Shared `AppError` codes stay aligned with `@koloda/app`.
- Each domain file mirrors one TS module, entity per file (`docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`).
  Change both sides together.
