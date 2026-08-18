# Assistant Chat: Data Access

Covers what user data the assistant reads, when that data is fetched and sent, what is recorded, and how retry treats it.
Does not cover the run lifecycle, retry availability, revert, or clone behavior — those are covered by the conversations spec.
This spec extends retry only where access context is involved.
Card proposal display, selection, and add are covered by the card-generation spec.
Prompt template editing is covered by the assistant settings spec.

## What is Data Access

Data access is the assistant reading user data beyond the conversation itself.
Reading is one event with two halves:

1. **Reach** — the app fetches the data locally.
2. **Egress** — the data leaves the machine toward the provider.

Data access is always on.
There is no consent prompt, no access mode, and no setting that turns it off or narrows it.
It behaves the same for every provider, local or cloud.

Every run discovers data by calling tools during the run.
Nothing about the user's decks is baked into the system prompt.
There is no submit-time snapshot of decks or cards.
Duplicate prevention is the model's choice to inspect existing cards through a tool before it proposes new ones.

## Resources

The assistant reads decks.

- It can list every deck: its id, name, card count, template title, and field titles.
- It can then fetch one deck's existing cards, as field-title-to-text pairs, within a budget.
- It can propose new cards for a deck.
  That proposal is not a write.
- Cards are read as part of their deck, never individually.
- A template is read through its deck, never on its own.

Scheduling statistics and lesson history are not read.

Writes are not part of data access.
The AI never creates cards directly; card creation always goes through the card review flow.

## Tools

The model sees the conversation and three tools, and it calls them if it needs data or wants to propose cards.

- `list_decks` — every deck's id, name, card count, template title, and field titles.
- `get_deck_cards` — the existing cards of one deck, identified by the id from the list.
- `propose_cards` — new flashcards for a deck.
  Generating, creating, making, or inventing cards — including a random card — uses this tool.
  It is not a way to pick an existing card.
  Cards must use the deck's field titles.
  Empty or invalid proposals do not create a review table.

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

- `list_decks`, `get_deck_cards`, and `propose_cards` show a translated label.
- Any other tool shows the protocol id.
- A successful `list_decks` also shows how many decks came back.
- A successful `get_deck_cards` also shows how many cards came back.
- A successful `propose_cards` also shows how many cards were accepted.
- A running call keeps the tool icon and shimmers the whole row.
- A failed call is marked failed.
- The user can expand a row to inspect the protocol id, the input, and the output or error.

Those rows live on the run, not in the conversation history sent on later turns.
Follow-up requests see the visible messages only, as the conversations spec already requires.
They do not replay prior tool results as history.
If the model needs current data again, it calls the tools again.

This is the same split as card outputs: the user sees them; the next request does not resend the tool rows as history.
Successful cards are serialized into history as the conversations spec requires.

### Budgets

Card lists returned by `get_deck_cards` are capped at 200 cards per deck.
They are also budgeted at 8,000 characters of serialized card content.
The true deck size is still reported.
When fewer cards are returned than the deck holds, the result says so.
An oversized deck degrades to the capped list.
It is never silently dropped.

`propose_cards` uses the same 200-card cap for accepted cards.
Invalid, empty, and over-cap cards are dropped from the accepted list.
They do not fail the tool call.

### Retry

A retried run may call tools again.
Those calls see the decks and cards as they are now, not as they were at the original submit.
Tool activity is recorded again on the run, replacing the previous tool rows.

Older runs may still store an injected-context snapshot from before tools.
That snapshot is inert.
It is not sent on retry.
It is not migrated away.

Profile, model, and parameters on retry come from the current selection, per the conversations spec.

### Models that cannot call tools

Every run offers the tools.
There is no injected-context fallback.
If the selected model cannot call tools, the provider error surfaces as a failed run.
The user can switch models and retry.

## Historical snapshots

Runs saved before this unification may still carry a submit-time access snapshot and a manifest.
That record is restore-only.

- It is not sent to the model.
- It is not used to prevent duplicates.
- Retry of those runs is chat with tools, against current data.
- A malformed snapshot fails restore as corrupt.

A **manifest** on those historical runs recorded what that request resolved: every deck's summary and the write target's counts.
Chat runs do not carry a manifest of this kind.
What a live run fetched is the tool activity on that run.

## Persistence

- Runs store tool activity on the run as an optional field.
  Rows saved before tool activity restore without it; the format version is unchanged.
  A malformed tool-activity value fails restore as corrupt, not as an empty conversation.
  That follows the conversations spec.
  After a crash, a run that was still streaming is interrupted.
  Any tool call that was still running is recorded as failed so it does not keep spinning.
- Historical snapshots remain on those runs as inert metadata, same optional-field policy.
  Rows saved before data access restore unchanged.
  A malformed snapshot fails restore as corrupt.
- The conversation stores nothing new for data access.
- Format versioning, migration, and unknown-version handling follow the conversations spec.

## Edge Cases

- An oversized deck always yields something: the capped list, never silence
- A user with no decks can still list them; the list is empty
- Deck data is never injected into the system prompt
- Edits after submit are visible to a retry, because tools run again
- A tool call for a missing deck fails that call.
  The run is not silently denied data access as a whole
- Tool rows survive reload; in-flight calls on a crash-restored run show as failed
- A model that cannot call tools fails the run with the provider error; there is no injected fallback
- Existing cards reach the model only when it calls `get_deck_cards`
