# Assistant Chat: Data Access

Covers what user data the assistant reads, how that data is resolved into run requests, what
is recorded about it, and how retry treats it.
Does not cover the run lifecycle, retry availability, revert, or clone behavior — those are
covered by the conversations spec.
This spec extends retry only where access context is involved.
Card generation output handling is covered by the card generation spec.
Prompt template editing is covered by the assistant settings spec.

## What is Data Access

Data access is the assistant reading user data beyond the conversation itself.
Reading is one event with two halves:

1. **Reach** — the app fetches the data locally.
2. **Egress** — the data leaves the machine inside the request.

Data access is always on.
There is no consent prompt, no access mode, and no setting that turns it off or narrows it.
It behaves the same for every provider, local or cloud.

Reading happens once, at submit.
The model cannot fetch data mid-run; everything it sees arrived with the request.

## Resources

The assistant reads decks.

- Every run carries a summary of each deck: its name, card count, and template.
- Card runs additionally carry the write-target deck's existing cards, which is what prevents
  duplicate generation.
- Cards are read as part of their deck, never individually.
- A template is read through its deck, never on its own.

Card generation also compiles template fields into its system prompt; that path is unchanged
and separate from data access.
Scheduling statistics and lesson history are not read.

Writes are not part of data access.
The AI never creates cards directly; card creation always goes through the card review flow.

## Context Resolution

Both chat and card runs resolve access context the same way, at submit time:

1. All decks are collected as summaries.
2. On card runs, the write-target deck's existing cards are collected within a budget.
3. The result is appended after the run's compiled system prompt.

The conversation history is unchanged.
Injected context is per-run, never part of the history.
It has no template placeholder; prompt templates are untouched.
"What the user sees is what the model gets" continues to govern messages only.

### Budgets

- Card lists are capped at 200 cards per deck and budgeted at 8,000 characters of card
  content: the count and fronts are included first; full fields only while the budget allows.
- An oversized deck degrades to the capped list.
  It is never silently dropped.
- Caps and truncation are recorded in the manifest.
- A card's front is the value of its template's first field.

### Snapshot

The resolved context is snapshotted onto the run at submit.
The snapshot is the context text together with its manifest.
Edits and deletions after submit cannot make a run diverge from its record.

## Manifests

A **manifest** is a per-run record of what was actually resolved.
It carries every deck's summary — name, card count, template — and, on card runs, the write
target's counts: how many cards exist, how many were listed, how many in full fields, and
whether the list was capped or truncated.

- It is persisted with the run.
  It answers "what of mine did this run see?" after the fact.
- It is kept for the life of the run.
  There is no compaction.
- It survives cancel and interrupt, recording whatever was resolved before the abort.
- A write target that no longer exists at submit resolves to nothing.
  The manifest records it as missing.

## Retry

Retry follows the conversations spec, with one extension: the retry replays the run's
snapshot.
The request carries the same data that was recorded at submit, even if decks changed since.
New runs pick up the changes; retries do not.
A run without a snapshot — from a conversation saved before data access — resolves fresh at
retry and records the result; later retries replay it.
Profile, model, and parameters on retry come from the current selection, per the
conversations spec.

## Persistence

- Run records store the access snapshot and the manifest as an optional field.
  Rows saved before data access restore unchanged; the format version is unchanged.
- A malformed manifest fails restore as corrupt, not as an empty conversation, per the
  conversations spec.
- The conversation stores nothing new for data access.
- Format versioning, migration, and unknown-version handling follow the conversations spec.

## Edge Cases

- An oversized deck always yields something: the capped list, never silence
- A user with no decks gets no injected context — runs carry the conversation as before, and
  the manifest records the empty state
- Edits and deletions after submit do not affect the active run — the snapshot was taken at
  submit
- A retry replays the snapshot as recorded, even if decks changed or were deleted since
  submit
- A write target deleted before submit contributes nothing; the manifest records it missing
- Chat runs never include card contents; they carry deck summaries only
- The model never pulls data mid-run — anything not included at submit is absent until a
  later run
