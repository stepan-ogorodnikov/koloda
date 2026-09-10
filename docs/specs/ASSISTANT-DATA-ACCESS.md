# Assistant Data Access

Covers what user data the assistant reads, when that data is fetched and sent, what is recorded, and how retry treats it.
Does not cover the run lifecycle, retry availability, revert, or clone behavior — those are covered by the conversations spec.
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

## Core Model

- **Reach** — the app reads user data locally, when a tool runs
- **Egress** — the tool result leaves the machine toward the provider, in the same run
- **Tools** — `list_decks`, `get_deck_cards`, and `propose_cards`
- **Tool activity** — the visible record of tool calls, kept on the run
  Reasoning rows share that list; see ASSISTANT-MESSAGES.md (§Message Content).
- **Budgets** — caps on tool output: 200 cards per deck list, 8,000 serialized characters, 200 accepted cards per proposal

Relationships:

- Data access is always on; every provider behaves the same.
- Discovery happens by tool calls during the run — never by system-prompt injection or submit-time snapshots.
- Tool activity lives on the run, not in the history; see ASSISTANT-CONVERSATIONS.md (§Conversation History).
- Writes are not part of data access; see ASSISTANT-CARD-GENERATION.md.

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
  See ASSISTANT-CARD-GENERATION.md (§How Cards Are Proposed).

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
- A successful `list_decks` also shows how many decks came back, after a dot.
- A successful `get_deck_cards` also shows how many cards came back, after a dot.
- A successful `propose_cards` also shows how many cards were accepted, after a dot.
- If any proposed cards were dropped, it also shows how many were skipped, after another dot.
- A running call keeps the tool icon and shimmers the whole row.
- A failed call is marked failed.
- Expanding a row shows the protocol id, the input, and the output or error.
- Tool rows start collapsed, including while a call is running.
- The user can expand or collapse the row.
- A chevron after the label points right when collapsed and rotates down when expanded.
- An elapsed time follows the label, separated by a dot, once the call has taken at least one second. A running call ticks; a finished call shows the frozen duration. Sub-second calls omit it.
- Long payloads scroll inside the expanded region so they do not stretch the message.
- The disclosed payload sits in a bordered container; the row and reasoning do not.

Those rows live on the run, not in the conversation history sent on later turns.
See ASSISTANT-CONVERSATIONS.md (§Conversation History).
Reasoning uses the same activity list; see ASSISTANT-MESSAGES.md (§Message Content).
Follow-up requests do not replay prior tool results as history.
If the model needs current data again, it calls the tools again.

Successful cards are serialized into history as the conversations spec requires.
See ASSISTANT-CARD-GENERATION.md (§Conversation History) for the markdown format.

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
The result reports `rejectedCount` and includes a message whenever any were dropped.
The activity row shows the skipped count next to the accepted count.
Dropped cards are never silently omitted from the result.

### Retry

A retried run may call tools again.
Those calls see the decks and cards as they are now, not as they were at the original submit.
Tool activity is recorded again on the run, replacing the previous tool rows.

See ASSISTANT-CONVERSATIONS.md (§Retry) for retry availability and AI profile state.

Older stored access records from before tools are not sent on retry.

### Models that cannot call tools

Every run offers the tools.
There is no injected-context fallback.
If the selected model cannot call tools, the provider error surfaces as a failed run.
The user can switch models and retry.

## Persistence

Runs store tool activity on the run.
Missing tool activity restores without it.
Elapsed time on a tool or reasoning row is stored with that row.
Rows saved before activity timers restore without them.
A malformed value fails restore as corrupt, not as an empty conversation; see ASSISTANT-CONVERSATIONS.md (§Restore).
After a crash, a run that was still streaming is interrupted.
Any tool call that was still running is recorded as failed so it does not keep spinning.
A reasoning row that was still running is closed as finished so it does not keep spinning.
Stored access records from before tools are not sent to the model.
Format versioning follows the conversations spec.
