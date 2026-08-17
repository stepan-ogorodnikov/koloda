# Assistant Chat: Data Access

Covers what user data the assistant reads, when that data is fetched and sent, what is recorded, and how retry treats it.
Does not cover the run lifecycle, retry availability, revert, or clone behavior — those are covered by the conversations spec.
This spec extends retry only where access context is involved.
Card generation output handling is covered by the card generation spec.
Prompt template editing is covered by the assistant settings spec.

## What is Data Access

Data access is the assistant reading user data beyond the conversation itself.
Reading is one event with two halves:

1. **Reach** — the app fetches the data locally.
2. **Egress** — the data leaves the machine toward the provider.

Data access is always on.
There is no consent prompt, no access mode, and no setting that turns it off or narrows it.
It behaves the same for every provider, local or cloud.

Chat and card runs use different mechanisms.
Chat runs discover data by calling tools during the run.
Nothing about the user's decks is baked into the chat system prompt.
Card runs still receive an injected snapshot at submit.
That card path is an interim bridge.
It is what still prevents duplicate generation until a later design unifies the two modes.

## Resources

The assistant reads decks.

- Chat can list every deck: its id, name, card count, template title, and field titles.
- Chat can then fetch one deck's existing cards, as field-title-to-text pairs, within a budget.
- Card runs carry a summary of each deck and the write-target deck's existing cards.
  That is what prevents duplicate generation.
- Cards are read as part of their deck, never individually.
- A template is read through its deck, never on its own.

Card generation also compiles template fields into its system prompt.
That path is unchanged and separate from data access.
Scheduling statistics and lesson history are not read.

Writes are not part of data access.
The AI never creates cards directly; card creation always goes through the card review flow.

## Chat: tools

The model sees the conversation and two tools, and it calls them if it needs data.

- `list_decks` — every deck's id, name, card count, template title, and field titles.
- `get_deck_cards` — the existing cards of one deck, identified by the id from the list.

Reach happens when a tool runs, not at submit.
Egress is the tool result sent back to the model in that same run.

A user with no decks still gets the tools.
Listing them returns an empty set.
A request for a deck that does not exist fails that tool call.
The run continues and the failure is visible.

The model may call tools a limited number of times in one run.
If it keeps calling instead of answering, the run stops.

### Visibility

Tool traffic is visible in the chat feed as compact rows on that assistant message.

- Each row shows the tool name as the protocol id, untranslated.
- A successful `list_decks` also shows how many decks came back.
- A successful `get_deck_cards` also shows how many cards came back.
- A running call shows a spinner.
- A failed call is marked failed.
- The user can expand a row to inspect the input and the output or error.

Those rows live on the run, not in the conversation history sent on later turns.
Follow-up requests see the visible messages only, as the conversations spec already requires.
They do not replay prior tool results as history.
If the model needs current data again, it calls the tools again.

This is the same split as card outputs: the user sees them; the next request does not resend them as history.

### Budgets

Card lists returned by `get_deck_cards` are capped at 200 cards per deck.
They are also budgeted at 8,000 characters of serialized card content.
The true deck size is still reported.
When fewer cards are returned than the deck holds, the result says so.
An oversized deck degrades to the capped list.
It is never silently dropped.

### Retry

A retried chat run may call tools again.
Those calls see the decks and cards as they are now, not as they were at the original submit.
Tool activity is recorded again on the run, replacing the previous tool rows.

Older chat runs may still store an injected-context snapshot from before tools.
That snapshot is inert.
It is not sent on retry.
It is not migrated away.

Profile, model, and parameters on retry come from the current selection, per the conversations spec.

### Models that cannot call tools

Chat always offers the tools.
There is no injected-context fallback for chat.
If the selected model cannot call tools, the provider error surfaces as a failed run.
The user can switch models and retry.

## Cards: injected snapshot (interim)

Card runs still resolve access at submit, once:

1. All decks are collected as summaries.
2. The write-target deck's existing cards are collected within a budget.
3. The result is appended after the run's compiled system prompt.

The conversation history is unchanged.
Injected context is per-run, never part of the history.
It has no template placeholder; prompt templates are untouched.
"What the user sees is what the model gets" continues to govern messages only.

Removing this path now would break duplicate prevention with no replacement.
It stays until a later design puts card generation on the same tool seam.

### Budgets

- Card lists are capped at 200 cards per deck and budgeted at 8,000 characters of card content.
  The count and fronts are included first; full fields only while the budget allows.
- An oversized deck degrades to the capped list.
  It is never silently dropped.
- Caps and truncation are recorded in the manifest.
- A card's front is the value of its template's first field.

### Snapshot

The resolved context is snapshotted onto the run at submit.
The snapshot is the context text together with its manifest.
Edits and deletions after submit cannot make a card run diverge from its record.

## Manifests

A **manifest** is a per-run record of what a **card** run actually resolved.
It carries every deck's summary — name, card count, template — and the write target's counts.
Those counts are how many cards exist, how many were listed, how many in full fields, and whether the list was capped or truncated.

- It is persisted with the run.
  It answers "what of mine did this run see?" after the fact.
- It is kept for the life of the run.
  There is no compaction.
- It survives cancel and interrupt, recording whatever was resolved before the abort.
- A write target that no longer exists at submit resolves to nothing.
  The manifest records it as missing.

Chat runs do not carry a manifest of this kind.
What a chat run fetched is the tool activity on that run.

## Retry (cards)

Retry follows the conversations spec, with one extension: a card retry replays the run's snapshot.
The request carries the same data that was recorded at submit, even if decks changed since.
New card runs pick up the changes; card retries do not.
A card run without a snapshot — from a conversation saved before data access — resolves fresh at retry.
Later retries replay that result.
Profile, model, and parameters on retry come from the current selection, per the conversations spec.

## Persistence

- Chat runs store tool activity on the run as an optional field.
  Rows saved before tool activity restore without it; the format version is unchanged.
  A malformed tool-activity value fails restore as corrupt, not as an empty conversation.
  That follows the conversations spec.
  After a crash, a run that was still streaming is interrupted.
  Any tool call that was still running is recorded as failed so it does not keep spinning.
- Card runs store the access snapshot and the manifest as an optional field, same policy.
  Rows saved before data access restore unchanged.
  A malformed manifest fails restore as corrupt.
- Older chat snapshots remain on those runs as inert metadata.
- The conversation stores nothing new for data access.
- Format versioning, migration, and unknown-version handling follow the conversations spec.

## Edge Cases

- An oversized deck always yields something: the capped list, never silence
- A user with no decks can still list them; the list is empty
- Chat never injects deck data into the system prompt
- Edits after a chat submit are visible to a retry, because tools run again
- Edits after a card submit do not affect that run or its retry.
  The snapshot was taken at submit
- A write target deleted before a card submit contributes nothing; the manifest records it missing
- A chat tool call for a missing deck fails that call.
  The run is not silently denied data access as a whole
- Tool rows survive reload; in-flight calls on a crash-restored run show as failed
- A model that cannot call tools fails the chat run with the provider error; there is no injected fallback
- Card runs still include existing write-target cards so generation can avoid duplicates
