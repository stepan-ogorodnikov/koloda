# How to Write Functional Specifications

Functional specification defines how a feature behaves.
It is the source of truth that the code should follow.

## What a Functional Specification Is

A verbal description of a feature's behavior and model.
It explains what the feature does.
It explains how it behaves in different situations.
It explains what edge cases exist.

## What a Functional Specification Is Not

- Not a task guide — it describes what the feature does, not how to change the code
- Not a code reference — no file paths, type names, or code snippets
- Not architecture documentation — no diagrams of module dependencies or data flow between files
- Not a changelog — use git history for that
- Not user-facing documentation — specs serve the developer, not the end user

## Principles

**Living document.**
A spec is updated whenever the behavior it describes changes.
The update happens in the same change as the code.
A spec that disagrees with the code is worse than no spec.

**Describe behavior, not implementation.**
Say "the conversation is saved after a delay."
Do not say "the pendingSaveAtom triggers a debounced handler."
The reader should understand what happens, not how it is coded.

**Write from the user's perspective.**
Describe what the user sees, does, and experiences.
"The user can retry a failed run" rather than "the retryRun function dispatches restartRun."

**Be concrete about edge cases.**
Do not just describe the happy path.
What happens on failure?
On cancellation?
On restore after a crash?
What does not get saved?
What is silently discarded?

**Scenarios over abstractions.**
Instead of "the system handles errors gracefully," describe: "if the stream fails mid-way, the error is displayed and the partial content is preserved."

## Formatting

- Each sentence starts on a new line.
- This makes diffs cleaner and improves readability in plain-text editors.
- Keep sentences short.
- One idea per sentence.
- If a sentence needs a comma, consider splitting it.

## Structure

A functional specification typically covers:

1. **Scope** — one sentence stating what the spec covers and what it explicitly does not cover
2. **What it is** — one or two paragraphs explaining the concept
3. **Core model** — the key entities and their relationships

Then organize the rest **by concept** (e.g., "Runs", "Persistence", "Retry").
Within each concept, state the behavior and the edge cases together.
Happy path and failure modes side by side.

Not every section is needed for every spec.
Use what fits.

## Checklist

- [ ] Scope is stated (what's in, what's out)
- [ ] No code references (file paths, type names, function names, imports)
- [ ] Written from the user's perspective
- [ ] Describes behavior, not implementation
- [ ] Covers edge cases and failure modes
- [ ] Explains what does not happen (e.g., "empty conversations are never persisted")
- [ ] Can be read without opening the code
- [ ] Short paragraphs, direct statements
- [ ] No aspirational language — describe what is, not what you hope for
