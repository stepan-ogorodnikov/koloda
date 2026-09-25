# Assistant Data Access

## Scope

Covers what user data the assistant reads, when that data is fetched and sent, what is recorded, and how retry treats it.
Does not cover the run lifecycle, retry availability, or revert.
Those are covered by ASSISTANT-CONVERSATIONS.md.
Clone is covered by ASSISTANT-CONVERSATION-LIST.md (§Clone).
Card proposal display, selection, and add are covered by the card-generation spec.
Prompt template editing is covered by the assistant settings spec.

## What it is

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

## Core model

- **Reach** — the app reads user data locally, when a tool runs
- **Egress** — the tool result leaves the machine toward the provider, in the same run
- **Tools** — `list_decks`, `list_templates`, `list_algorithms`, `get_deck`, `get_template`, `get_deck_cards`, `add_deck`, and `propose_cards`
- **Tool activity** — the visible record of tool calls, kept on the run
  Reasoning rows share that list; see ASSISTANT-MESSAGES.md (§Message Content).
- **Budgets** — caps on tool output: 200 cards per deck list, 8,000 serialized characters, 200 accepted cards per proposal

Relationships:

- Data access is always on; every provider behaves the same.
- Discovery happens by tool calls during the run — never by system-prompt injection or submit-time snapshots.
- Tool activity lives on the run, not in the history; see ASSISTANT-CONVERSATIONS.md (§Conversation History).
- Persistence is not part of data access. Card content follows ASSISTANT-CARD-GENERATION.md. Empty-deck create is the named mutation in Resources.

## Resources

The assistant reads decks, templates, and algorithms (presets).

Templates are a first-class readable resource.
The assistant may list templates and fetch one template by id.
Deck tools may still surface template title and field titles; that is not a substitute for full field metadata (types, required, field ids) when the model needs it.

- It can list every deck: its id, name, card count, template title, and field titles.
- It can fetch one deck's structural summary: its id, name, card count, template title, and field titles.
- It can list every template: its id, title, and field titles.
- It can fetch one template's full structure: its id, title, and fields (id, title, type, required).
- It can list every algorithm (preset): its id, title, and FSRS settings.
- It can then fetch one deck's existing cards, as field-title-to-text pairs, within a budget.
- It can propose new cards for a deck.
  That proposal does not persist card content.
- Cards are read as part of their deck, never individually.

Scheduling statistics and lesson history are not read.

Writes are not part of data access.
Card content never persists without review.
`add_deck` is an allowed assistant mutation, not a data-access read.
It creates an empty deck shell directly after the title, template, and algorithm validate.
The user can delete that deck the same way as a deck they created by hand.
It does not create cards and does not set a propose write target.
`propose_cards` remains the only path that stages card content for review.
This does not extend to template field edits, algorithm parameter edits, or deletes.
Those still need a named product spec with undo and validation.

## Tools

The model sees the conversation and eight tools.
It calls them if it needs data, wants to create an empty deck, or wants to propose cards.

- `list_decks` — every deck's id, name, card count, template title, and field titles.
- `list_templates` — every template's id, title, and field titles.
- `list_algorithms` — every preset's id, title, and FSRS settings.
  Users call algorithms presets.
- `get_deck` — one deck's id, name, card count, template title, and field titles, identified by the id from `list_decks`.
  It does not return card bodies.
- `get_template` — one template's full field metadata, identified by the id from `list_templates` (or another tool result that returned that id).
  It does not return decks or card bodies.
- `get_deck_cards` — the existing cards of one deck, identified by the id from the list.
- `add_deck` — an empty deck for one template.
  Call `list_templates` first for the template id.
  Pass an algorithm id only when the user asked for a specific algorithm, using the id from `list_algorithms`.
  Otherwise omit it and the app stores the same default algorithm as manual deck create.
  This writes the deck immediately.
  A missing template or algorithm fails the call and leaves no deck.
  It does not create cards, edit templates, or edit algorithms.
  Inventing cards still requires `propose_cards`.
- `propose_cards` — new flashcards for a deck.
  Generating, creating, making, or inventing cards — including a random card — uses this tool.
  It is not a way to pick an existing card.
  Cards must use the deck's field titles.
  See ASSISTANT-CARD-GENERATION.md (§How Cards Are Proposed).

Reach happens when a tool runs, not at submit.
Egress is the tool result sent back to the model in that same run.

A user with no decks, templates, or algorithms still gets the tools.
Listing them returns an empty set.
A request for a deck or template that does not exist fails that tool call.
The run continues and the failure is visible.

The model may call tools a limited number of times in one run.
If it keeps calling instead of answering, the run stops.

### Visibility

Tool traffic is visible in the chat feed as compact rows on that assistant message.

- `list_decks`, `list_templates`, `list_algorithms`, `get_deck`, `get_template`, `get_deck_cards`, `add_deck`, and `propose_cards` show a translated label.
- Any other tool shows the protocol id.
- A successful `list_decks` also shows how many decks came back, after a dot.
- A successful `list_templates` also shows how many templates came back, after a dot.
- A successful `list_algorithms` also shows how many algorithms came back, after a dot.
- A successful `get_deck` also shows the deck title, after a dot.
- A successful `get_template` also shows the template title, after a dot.
- A successful `get_deck_cards` also shows how many cards came back, after a dot.
- A successful `add_deck` also shows the deck title, after a dot.
- A successful `propose_cards` also shows how many cards were accepted, after a dot.
- If any proposed cards were dropped, it also shows how many were skipped, after another dot.
- A running call keeps the tool icon and shimmers the whole row.
- A failed call is marked failed.
- Expanding a row shows the protocol id, the input, and the output or error.
- Tool and reasoning rows start collapsed, including while a call or thinking is in progress.
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
