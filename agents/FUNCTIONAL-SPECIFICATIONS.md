# Functional Specifications

How to write and update functional specs in `docs/specs/`.
A spec is the source of truth for product behavior.
The code follows the spec.

This is a standing standard, not an add-only playbook.
Use it when creating a spec and whenever a behavior change edits one.

## What a Functional Specification Is

A verbal description of a feature's behavior and model.
It explains what the feature does.
It explains how it behaves in different situations, including failure and boundary cases.

## What a Functional Specification Is Not

- Not a task guide — it describes what the feature does, not how to change the code
- Not a code reference — no file paths, type names, or code snippets
- Not architecture documentation — no diagrams of module dependencies or data flow between files
- Not a changelog — use git history for that
- Not user-facing documentation — specs serve the developer, not the end user
- Not a storage schema — persistence field names and migration history belong in code and comments
- Not a UI mock — layout, alignment, and chrome belong in the product, not the spec

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

**One home per rule.**
Each invariant lives in exactly one spec.
Other specs point at that home.
They do not restate it.
A pointer looks like `TEMPLATES.md (§Locking)`.
If you are about to copy a sentence that already exists elsewhere, replace the copy with a pointer.

**Edge cases live with the concept.**
Put failure, empty, cancel, restore, and "does not happen" next to the happy path they qualify.
Do not collect them in an "Edge Cases" section at the end.

**Scenarios over abstractions.**
Instead of "the system handles errors gracefully," describe: "if the stream fails mid-way, the error is displayed and the partial content is preserved."

**No chrome.**
Name a control when the user must find it ("the conversation menu").
Do not describe bubbles, alignment, panel placement, or wide-versus-narrow layout unless that layout *is* the behavior.

**No persistence archaeology.**
Say that a conversation without an identity is not saved.
Do not name `schemaVersion`, debounce milliseconds, or how old documents are rejected on restore.

## Formatting

Follow `agents/MARKDOWN.md`.

Enumerate concrete values as lists, not prose.
One value per item.
State the default as a separate statement, not as a list annotation.

Cross-references use the sibling filename and the section heading: `CARDS.md (§Relationships)`.
Do not invent HTML anchors.
Heading text is the stable id.

## Structure

A functional specification typically covers:

1. **Scope** — what this spec covers, and what it leaves to named sibling specs
2. **What it is** — one or two paragraphs explaining the concept
3. **Core model** — a glossary of terms, then relationships

Then organize the rest **by concept** (e.g., "Runs", "Persistence", "Retry").
Within each concept, state the behavior and the edge cases together.

Not every section is needed for every spec.
Use what fits.

### Scope

One or two sentences of coverage.
Then name the out-of-scope areas by pointing at the spec that owns them.
That is how `agents/INDEX.md` loads one primary spec instead of a cluster.

A reader who only has this file should know when they must open a sibling.

### Core Model

A glossary, not a preview of later sections.
Each bullet is a term and a short definition.
Relationships are the invariants that belong in *this* spec.
If a relationship is owned elsewhere, the bullet is a pointer, not a restatement.

### Concept sections

One heading per user-facing idea.
Happy path and failure modes in the same section.
If a subsection would only repeat another spec, delete it and point.

Do not add:

- An "Edge Cases" dump
- Implementation field names
- Restore or migration history unless the user-visible restore behavior itself is the topic, and then only the behavior

## Naming

The filename is the topic: `CARDS.md`, `ASSISTANT-MESSAGES.md`.
Do not prefix a parent area onto every child (`ASSISTANT-CHAT-MESSAGES.md`).
The folder and the leading token already give the area.

## Adding, updating, splitting

**Update** the existing spec when the behavior of that concept changes.
Do not start a new file for a small addition to a covered concept.

**Add** a new spec when the concept has its own lifecycle, model, and out-of-scope boundary.
Give it a Scope that names its siblings.
Update those siblings so they point here instead of describing the new concept.

**Split** when one spec is the home for two unrelated models, or when INDEX cannot pick a single primary spec for a typical task.

After any of those, grep for restated copies of the moved rules and replace them with pointers.

## Routing

Specs are loaded one at a time.
Write each spec so a typical task can use it as the only spec in the prompt.
INDEX and area maps (`agents/ASSISTANT-MAP.md`) name one primary spec per task.
They add a sibling only when the task crosses that spec's stated out-of-scope.

Do not write a spec that only makes sense as part of a bundle.

## Checklist

- [ ] Scope states what's in and which sibling owns what's out
- [ ] Core Model is a glossary plus this spec's relationships, not a recap of later sections
- [ ] Each invariant has one home; copies are pointers (`FILE.md (§Section)`)
- [ ] Edge cases sit in the concept they qualify; there is no "Edge Cases" section
- [ ] No code references (file paths, type names, function names, imports)
- [ ] No persistence field names, debounce timings, or restore/migration archaeology
- [ ] No UI chrome (alignment, bubbles, layout breakpoints) unless that layout is the behavior
- [ ] Written from the user's perspective
- [ ] Describes behavior, not implementation
- [ ] Explains what does not happen (e.g., "clearing the composer does not delete the conversation")
- [ ] Can be read without opening the code
- [ ] Filename is the topic, with no redundant parent prefix
- [ ] A typical task can load this spec alone
- [ ] Short paragraphs, direct statements
- [ ] No aspirational language — describe what is, not what you hope for
