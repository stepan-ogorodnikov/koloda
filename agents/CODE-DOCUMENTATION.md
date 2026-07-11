# Code Documentation Guide for AI Agents

This guide defines how code should be documented in this repository.

Core Principle: Proximity equals accuracy. Critical implementation details must live in the code file, as close to the logic as possible.

## What NOT to Document

Do not write comments that explain what the code does. Developers and LLMs can read code.

- Bad: `// Loops through the text stream and calls onChunk`
- Bad: `// Returns the conversation name truncated to 48 characters`

Do not write JSDoc or block comments for simple functions, getters, or standard UI components unless they have hidden complexity.

## What TO Document (The "Traps")

You must document code that is non-obvious, fragile, or intentionally divergent.
Always ask: "If another developer (or LLM) saw this, would they try to 'fix' it and break something?" If yes, document it.

Document these scenarios:

- Counter-intuitive logic: Code that looks wrong but is correct.
- Library workarounds: Quirks with the Vercel AI SDK, Ollama, Tauri, etc.
- Invariants: State transitions or data shapes that must not change.
- Edge cases: Handling of partial failures, aborted streams, or empty states.

## Strict Commenting Rules

RULE: Do not write comments unless they strictly match one of the following tags. 

If a piece of code does not require a tag, it must not have a comment. Do not write JSDoc, do not explain "what" the code does, and do not leave notes.
LLMs are excellent at reading code; only document the traps.

### Allowed Tags:

1. `// WHY`:

Use this when the code looks weird, redundant, or backwards. It stops future agents from "cleaning up" the code and breaking it.

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

Use this to enforce architectural boundaries or state rules. This tells future agents "do not change this return value or state transition."

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

Use this for library bugs or missing features. If you don't use this, a future agent will try to "fix" your hack when the library updates.

Example:

```typescript
// WORKAROUND: Ollama does not reliably support the AI SDK's Output.array structured streaming.
// We intentionally use text completion and parse it manually for Ollama/LMStudio.
async function runTextCompletionCardGeneration(...) { ... }
```

### The Only Exception: Complex Logic

The only time you may write a comment without a tag is inside a function body to explain highly complex, non-obvious algorithm steps (e.g., a complex regex or data transformation pipeline).
Even then, only comment the steps, not the obvious lines.

## Comments vs. Architecture Decision Records (ADRs)

How do you know if a decision needs a code comment or a full ADR file in `docs/adr/`?

- Use a Code Comment when the decision is localized to a single function or file.
- Use an ADR when the decision affects multiple files or layers (e.g., TS and Rust duplication, dual card generation strategies).
  A comment in `provider-catalog.ts` won't be seen by an agent editing `domain/ai.rs`. ADRs bridge that gap.

Summary Checklist for Agents

- Did I write a comment explaining why I did something instead of what I did?
- Did I use `// WHY`:, `// INVARIANT`:, or `// WORKAROUND`: for any non-obvious code?
- Did I avoid adding redundant JSDoc or noise?
- If my change spans multiple layers, did I check if it needs an ADR?
