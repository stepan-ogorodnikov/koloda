# Entity notes

Status: done

## Intent

An optional short user note on decks, algorithms (presets), and templates — e.g. "Use this preset for vocabulary, not cramming". It helps the user remember why the entity exists, and the assistant reads it when choosing between entities.

Done when: the user can write a note on each of the three entities in its edit form on both hosts, it persists on both stores, and the assistant sees it in tool output as user-written context it cannot change.

## Scope

In: nullable `notes` on decks, templates, algorithms; shared validation; both stores; assistant read output with list_decks truncation; edit forms; spec bullets.
Out: assistant drafting notes; notes on cards; showing notes outside edit forms; assistant writes of any kind (add_deck unchanged); copying notes on clone; notes in the system prompt.

## Open questions

- [x] Field name: `notes` or `description`? — `notes`. "description" collides with the tool spec's `description` field in the assistant layer.
- [x] list_decks and get_deck share DeckSummaryOutput — keep one shared type with an explicit truncation flag present only when truncated (no type fork). Presented for approval.
- [x] DB constraints — DB.md: hand-written V2 (next after V1__init.sql), one shared SQL series, no backticks, no NOT NULL/default, refresh embedded listings both hosts, regenerate schema-inventory.json; BACKWARDS-COMPATIBILITY.md: no adapters, update all call sites, compiler-guided.
- [x] Edit forms — all three share one pattern (libs/srs-react route pages: useAppForm + @koloda/srs schema + parse→mutate→invalidate). Create dialogs are separate; no divergent form found.

## Plan

- [x] 1. Add the notes column on both hosts (migration parity)
  Goal: one new hand-written migration `crates/koloda/src/migrations/V2__entity_notes.sql` adding a nullable `notes text` column to decks, templates, and algorithms; refresh the embedded listings on both hosts; regenerate the schema inventory.
  Constraints: next V after V1; never edit applied files; no backticks; nullable, no NOT NULL, no default; one shared SQL series for both hosts (DB.md §Schema Change Workflow).
  Done when: `cargo test -p koloda` green after touching `crates/koloda/src/migrations/mod.rs` (or `cargo clean -p koloda`); inventory regenerated with `cargo test -p koloda --test integration write_schema_inventory_snapshot -- --ignored`; `bunx nx test @koloda/db-sqlite` green after rebuilding `@koloda/db-sqlite` (or `nx reset`) so the Vite glob embeds V2.
  Green: yes.
  Commit: Add nullable notes column to decks, templates, and algorithms
  Depends on: none

- [x] 2. Carry notes through the shared TS boundary and the web store
  Goal: shared validation and web SQLite read/write support.
  Notes rule: plain text, trim, whitespace-only → absent (null), max 1024 after trim; constant next to `requiredEntityTitleSchema` (its module in libs/app); Zod schemas in libs/srs (deck/template/algorithm validation + row + update schemas) gain optional notes; libs/db-sqlite decks.ts/templates.ts/algorithms.ts SELECT, map, and update notes (null clears); inserts untouched (notes absent on create).
  Constraints: validation at the shared boundary both hosts call (libs/srs schemas; Rust mirrors in item 3); update path writes null as cleared; create paths leave notes NULL; i18n validation key for too-long in both hosts' locales (I18N.md).
  Done when: bun tests for libs/srs and libs/db-sqlite pass: update persists a note, whitespace-only stores null, >1024 rejected, trimmed value stored.
  Green: yes.
  Commit: Add notes to shared entity schemas and the web SQLite layer
  Depends on: 1

- [x] 3. Mirror notes in the Rust domain, repo, and electron DB surface
  Progress (session 2): domain structs (Deck/Template/Algorithm + Update*Values), common.rs (`normalize_optional_notes`, `validate_notes`, NOTES_MAX_LENGTH), error code, repo mappers/SELECTs/UPDATEs, serde + integration test literals, `tests/domain/entity_notes_tests.rs` all edited; electron mirror needs NO edits (types flow from @koloda/srs). Remaining: (a) algorithm fixture needs 21 comma-separated weights (FSRS6_WEIGHT_COUNT=21) and integer retention 70–99; (b) drop unused `normalize_optional_notes` from domain/{decks,templates,algorithms}.rs imports; (c) fixture helpers return Result — unwrap only inside #[test] fns (clippy allow-unwrap-in-tests does not cover helpers); (d) cargo test -p koloda + clippy green, then commit.
  Goal: desktop parity.
  Domain structs Deck/Template/Algorithm gain `notes: Option<String>`; Update*Values gain Option<String>; normalization next to `normalize_required_title` in crates/koloda/src/domain/common.rs; repo decks.rs/templates.rs/algorithms.rs extend SELECTs, row mappers, and UPDATE SET; inserts and clones untouched; apps/electron/src/koloda-db.ts (hand-written NAPI mirror) gains notes in rows and update payloads.
  Constraints: inserts and clone paths untouched (new and cloned entities have no note); no adapter layers (BACKWARDS-COMPATIBILITY.md).
  Done when: `cargo test -p koloda` green; electron side type-checks with the mirror matching the NAPI surface; update paths persist and clear notes.
  Green: yes.
  Commit: Mirror notes in the Rust domain, repo, and electron DB layer
  Depends on: 1

- [x] 4. Expose notes to the assistant read-only, truncated in list_decks
  Goal: tool layer.
  libs/ai assistant-tools.ts: source types gain nullable notes; list_algorithms, list_templates, get_template, get_deck return the full note; list_decks returns a note truncated at a named ~150-char constant with an explicit truncation flag present only when actually truncated; notes omitted when absent; the five tool descriptions say the note is user-written context about the entity, not instructions; add_deck unchanged; get_deck_cards and propose_cards outputs never include notes; prompts.ts untouched (notes never in the system prompt).
  Constraints: no new AssistantToolDataSource methods; both host binders updated in the same change: apps/web/src/app/ai-runtime.ts, apps/electron/src/ai-ipc.ts; spec bullets in docs/specs/ASSISTANT-DATA-ACCESS.md (§Resources, §Tools).
  Done when: libs/ai tests cover full vs truncated vs absent and assert no notes key in get_deck_cards/propose_cards output; both binders pass notes through; assistant e2e specs on both hosts (apps/web-e2e, apps/electron-e2e) assert a note flows through.
  Green: yes.
  Commit: Expose entity notes in assistant tool output, truncated in list_decks
  Depends on: 2, 3

- [x] 5. Add the notes field to the three edit forms
  Goal: libs/srs-react deck-details.tsx, template.tsx, algorithm.tsx gain an optional plain-text notes textarea bound to the shared update schema (maxlength 1024, trims on save, whitespace-only saves as cleared); create and clone dialogs unchanged; label i18n keys in both hosts' locales per I18N.md.
  Constraints: no notes field in create/clone dialogs; no note display outside edit forms; forms keep the shared useAppForm pattern.
  Done when: each edit form shows, saves, and clears notes; >1024 blocked by the shared schema; form tests where the existing pattern has them pass.
  Green: yes.
  Commit: Add a notes field to the deck, template, and algorithm edit forms
  Depends on: 2

## Outcome

Shipped as five commits on `task/entity-notes` (eb145da, 54df8a0, 764b68d, 7d48002, 0c78460). Both hosts store nullable `notes` on decks, templates, and algorithms (V2, one shared SQL series); the shared TS boundary trims, normalizes whitespace-only to absent, and caps at 1024 UTF-16 units, mirrored in Rust (`validate_notes` counts UTF-16 like the TS limit; parity test back on the Rust list). The assistant reads notes through list_algorithms, list_templates, get_template, and get_deck (whole), and list_decks (150-char preview with explicit `notesTruncated`) — read-only, omitted when absent, never in get_deck_cards/propose_cards output or the system prompt. All three edit forms gained a Notes textarea (create and clone dialogs untouched). The e2e assertion for notes-through-tools landed with item 5 (the form is the only way to write a note); it runs on both hosts. The electron mirror needed no edits — its types flow from @koloda/srs. `bun run check:push` green at the tip.
