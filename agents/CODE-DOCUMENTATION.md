# Code Documentation Guide for AI Agents

This guide defines how code should be documented in this repository.

Core Principle: Proximity equals accuracy.
Critical implementation details must live in the code file, as close to the logic as possible.

## What NOT to Document

Do not write comments that explain what the code does.
Developers and LLMs can read code.

- Bad: `// Loops through the text stream and calls onChunk`
- Bad: `// Returns the conversation name truncated to 48 characters`

Do not write JSDoc or block comments for simple functions, getters, or standard UI components unless they have hidden complexity.

## What TO Document (The "Traps")

You must document code that is non-obvious, fragile, or intentionally divergent.
Always ask: "If another developer (or LLM) saw this, would they try to 'fix' it and break something?"
If yes, document it.

Document these scenarios:

- Counter-intuitive logic: Code that looks wrong but is correct.
- Library workarounds: Quirks with the Vercel AI SDK, Ollama, etc.
- Invariants: State transitions or data shapes that must not change.
- Edge cases: Handling of partial failures, aborted streams, or empty states.

## Strict Commenting Rules

RULE: Inline comments must use one of the following tags (or match an exception below).

If a piece of code does not require a tag and is not an allowed exception, it must not have a comment.
Do not write JSDoc that narrates APIs, do not explain "what" the code does, and do not leave notes.
LLMs are excellent at reading code; document traps inline.
Use the orientation exception only at file/type entry points.

### Allowed Tags:

1. `// WHY`:

Use this when the code looks weird, redundant, or backwards.
It stops future agents from "cleaning up" the code and breaking it.

Example:

```typescript
let streamedError: unknown = null;
const result = streamText({
  // ... config ...
  onError: ({ error }) => {
    streamedError = error;
  },
});

try {
  for await (const chunk of result.textStream) {
    onChunk(chunk);
  }
} catch (error) {
  // WHY: The Vercel AI SDK's for-await loop can swallow the actual API error.
  // We catch it here and prefer the onError payload, as it has better details.
  throw streamedError ?? error;
}
```

2. `// INVARIANT`:

Use this to enforce architectural boundaries or state rules.
This tells future agents "do not change this return value or state transition."

Example:

```typescript
const handleCancel = useCallback(() => {
  // INVARIANT: Canceling a run must still persist the partial content.
  // Do not clear the assistant message here. The user needs to see what was generated.
  setRunStatus({ status: 'canceled' });
  // ... persistence logic
}, []);
```

3. `// WORKAROUND`:

Use this for library bugs or missing features.
If you don't use this, a future agent will try to "fix" your hack when the library updates.

Example:

```typescript
// WORKAROUND: elementStream can finish with zero elements even when the model returned usable text.
// Prefer parsing result.text before falling through to a second generateText call.
const streamedTextCards = parseGeneratedCardsText(await result.text, fields);
if (streamedTextCards.length > 0) {
  for (const card of streamedTextCards) onCard(card);
  return;
}
```

### Exceptions

#### 1. Complex Logic

You may write a comment without a tag inside a function body to explain highly complex, non-obvious algorithm steps (e.g., a complex regex or data transformation pipeline).
Even then, only comment the steps, not the obvious lines.

#### 2. Module / Type Orientation (LLM Observability)

Short crate/module rustdoc (`//!`) and rare type-level docs (`///` / block docs) may state **ownership boundaries**, **cross-system mappings**, or **do-not-interpret** rules.
That way an agent that opened the file without the README still lands correctly.

Allowed:

- Thin module maps that point at README / ADR ownership (do not rehash the README).
- Type docs that encode mappings agents would otherwise "fix" (e.g. FSRS state ints ↔ SQL lesson/review buckets).
- Prefer `// INVARIANT:` / `// WHY:` on the field or call site when the rule is localized.
- Use type/module docs when the rule is the type's reason to exist.

Forbidden under this exception:

- API narration ("returns X", "loops over Y", documenting every public fn).
- Layer essays that belong in an ADR.
- Duplicating README paragraphs at the top of every file.

Example (module):

```rust
//! Domain DTOs, validation, and serde — mirrors `@koloda/srs` / `@koloda/app`.
//!
//! Must not import `rusqlite`. Shared errors via `crate::app::error::AppError` are intentional.
//! Layer map: crate `README.md`. Mirroring: `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`.
```

Example (type):

```rust
/// FSRS card/review state integers stored in SQLite (mirrors `ts-fsrs` `State`).
///
/// Lesson/review SQL buckets: New → untouched; Learning+Relearning → learn; Review → review.
pub enum CardState { /* ... */ }
```

## Comments vs. Architecture Decision Records (ADRs)

How do you know if a decision needs a code comment or a full ADR file in `docs/adr/`?

- Use a Code Comment when the decision is localized to a single function or file.
- Use module/type orientation docs when an agent opening that module needs ownership or mapping context immediately.
- Use an ADR when the decision affects multiple files or layers (e.g., TS and Rust duplication, dual-platform persistence).
  A comment in `provider-catalog.ts` won't be seen by an agent editing `domain/ai.rs`.
  ADRs bridge that gap.

Index: `docs/adr/README.md`.
Start with `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` when a change touches both TS domain and `koloda-core`.

Summary Checklist for Agents

- Did I write a comment explaining why I did something instead of what I did?
- Did I use `// WHY`:, `// INVARIANT:`, or `// WORKAROUND`: for any non-obvious inline code?
- If I added module/type docs, do they state ownership, mappings, or do-not-interpret rules — not API narration?
- Did I avoid adding redundant JSDoc or noise?
- If my change spans multiple layers, did I check if it needs an ADR?
