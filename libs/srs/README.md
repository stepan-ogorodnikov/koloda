# @koloda/srs

SRS domain logic: zod schemas, FSRS integration, lesson/review rules, markdown helpers, and pure transforms from AI card output to insert DTOs.
Framework-agnostic — no React, no DB access, no conversation state.

## Where it sits

Consumed by `@koloda/srs-pgsql` (repo validation), `@koloda/srs-react`, `@koloda/core-react` (query types), and app query layers.
Depends on `@koloda/app` and `@koloda/ai`.
Desktop mirrors live in `crates/koloda-core/src/domain/`; keep TS and Rust aligned when fields change.

## Architectural Map

- Algorithms: `algorithms.ts` — entity schemas and CRUD/clone DTOs; `algorithms-fsrs.ts` — FSRS params, `createFSRSAlgorithm()`, learning-step units/grades (`ts-fsrs`).
- Templates & decks: `templates.ts`, `decks.ts` — fields/layout validation and entity DTOs.
- Cards: `cards.ts` — content schema from template fields, FSRS state fields, insert/update/delete DTOs.
- Reviews & lessons: `reviews.ts` — review logs and daily-limit helpers; `lessons.ts` — lesson types, filters, session DTOs.
- Markdown: `markdown.ts` — `markdownToHtml` / `markdownToText` / `isMarkdownEmpty` (marked + DOMPurify).
- AI bridge (pure): `assistant-cards-generation.ts` — `transformGeneratedCards()` (`GeneratedCard` → `InsertCardData`).

### Does NOT own (prevent scope creep)

- DB access or Drizzle schema — `@koloda/srs-pgsql`, `@koloda/srs-sqlite`, `koloda-core`
- React screens or conversation/run state — `@koloda/srs-react`
- AI streaming / providers — `@koloda/ai`

## Read next

- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — why TS and Rust domain stay duplicated
- `agents/DB.md` — update domain here when schema fields change
- `docs/specs/ASSISTANT-CHAT-CARD-GENERATION.md` — card generation behavior this lib serves
