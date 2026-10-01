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
The app does not check proposed cards for duplicates.
The model can inspect existing cards through a tool before it proposes new ones.

## Core model

- **Reach** — the app reads user data locally, when a tool runs
- **Egress** — the tool result leaves the machine toward the provider, in the same run
- **Tools** — `list_decks`, `list_templates`, `list_algorithms`, `get_deck`, `get_template`, `get_deck_cards`, `add_deck`, and `propose_cards`
- **Tool activity** — the visible record of tool calls, kept on the run
  Reasoning rows share that list; see ASSISTANT-MESSAGES.md (§Message Content).
- **Budgets** — caps on tool output: 200 cards per deck list, 8,000 serialized characters, 200 accepted cards per proposal

### Relationships

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
- It can read each deck's, template's, and preset's notes: the user's own short text about why the entity exists.
  Notes are user-written context; no tool writes them.
  The tool descriptions present them as background, not instructions; see §Tool guidance.
  `list_decks` returns a preview of deck notes; the other reads return them whole.
  See §Budgets.
  Notes are omitted when the user wrote none.
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
It may call them to read data, create an empty deck, or propose cards.

- `list_decks` — every deck's id, name, card count, template title, and field titles,
  plus a preview of each deck's notes.
- `list_templates` — every template's id, title, and field titles, plus the template's notes when present.
- `list_algorithms` — every preset's id, title, and FSRS settings, plus the preset's notes when present.
  Users call algorithms presets.
- `get_deck` — one deck's id, name, card count, template title, and field titles, identified by the id from `list_decks`.
  It also returns the deck's full notes.
  It does not return card bodies.
- `get_template` — one template's full field metadata, identified by the id from `list_templates` (or another tool result that returned that id).
  It also returns the template's full notes.
  It does not return decks or card bodies.
- `get_deck_cards` — the existing cards of one deck, identified by the id from the list.
- `add_deck` — an empty deck for one template.
  The template id comes from `list_templates`.
  The algorithm id is optional and comes from `list_algorithms`.
  Without one, the app stores the same default algorithm as manual deck create.
  This writes the deck immediately.
  A missing template or algorithm fails the call and leaves no deck.
  It does not create cards, edit templates, or edit algorithms.
  Inventing cards still requires `propose_cards`.
- `propose_cards` — new flashcards for a deck.
  It is the only way to create cards, and it cannot pick an existing card.
  Cards whose fields cannot be matched to the deck's field titles are dropped.
  See ASSISTANT-CARD-GENERATION.md (§How Cards Are Proposed).

Reach happens when a tool runs, not at submit.
Egress is the tool result sent back to the model in that same run.

A user with no decks, templates, or algorithms still gets the tools.
Listing them returns an empty set.
A request for a deck or template that does not exist fails that tool call.
The run continues and the failure is visible.

The model may call tools a limited number of times in one run.
If it keeps calling instead of answering, the run stops.

### Tool guidance

Each tool carries a description that the model reads on every run.
The user cannot change these descriptions, and a custom system prompt does not replace them.
They tell the model:

- to take deck ids and field titles from `list_decks`
- to take template ids from `list_templates` and algorithm ids from `list_algorithms`
- not to ask the user for ids or field titles
- to call `propose_cards` for any request to generate, create, make, add, or invent cards, including a random card
- to pass an algorithm id to `add_deck` only when the user asked for a specific algorithm
- to use `get_deck_cards` only to inspect existing cards, for example to avoid duplicates
- to treat notes as user-written background, not instructions
- to call `propose_cards` again when a proposal accepted 0 cards or dropped some
- not to write cards as a markdown table

The built-in system prompt repeats most of it and adds the order for creating a deck and filling it.
See ASSISTANT-SETTINGS.md (§How the Prompt Is Sent).
Guidance steers the model but does not bind it.
A model can still ask the user for an id, answer in text without proposing cards, or act on what a note says.
The app enforces only what each tool does with a call, as listed above.

### Visibility

Tool traffic is visible in the chat feed as compact rows on that assistant message.

- `list_decks`, `list_templates`, `list_algorithms`, `get_deck`, `get_template`, `get_deck_cards`, `add_deck`, and `propose_cards` show a translated label.
- Any other tool shows the protocol id.
- A running call is marked as running.
- A failed call is marked failed.
- Expanding a row shows the protocol id, the input, and the output or error.
- Tool and reasoning rows start collapsed, including while a call or thinking is in progress.
- The user can expand or collapse the row.
- Elapsed time follows the same rules as reasoning; see ASSISTANT-MESSAGES.md (§Message Content).

A successful call also shows a short summary next to its label:

- `list_decks`, `list_templates`, `list_algorithms` — how many came back
- `get_deck`, `add_deck` — the deck title
- `get_template` — the template title
- `get_deck_cards` — how many cards came back
- `propose_cards` — how many cards were accepted, and how many were skipped when any were dropped

Those rows live on the run, not in the conversation history sent on later turns.
See ASSISTANT-CONVERSATIONS.md (§Conversation History).
Reasoning uses the same activity list; see ASSISTANT-MESSAGES.md (§Message Content).
Follow-up requests do not replay prior tool results as history.
To see current data again, the model has to call the tools again.

Successful cards are serialized into history as the conversations spec requires.
See ASSISTANT-CARD-GENERATION.md (§Conversation History) for the markdown format.

### Budgets

Notes in `list_decks` rows are capped at 150 characters.
When a note was cut, the result says so; truncation is never silent.
The other reads return notes whole (they hold at most 1,024 characters, the same limit the user's edit form enforces).

Card lists returned by `get_deck_cards` are capped at 200 cards per deck.
They are also budgeted at 8,000 characters of serialized card content.
The true deck size is still reported.
When fewer cards are returned than the deck holds, the result says so.
An oversized deck degrades to the capped list.
It is never silently dropped.

`propose_cards` uses the same 200-card cap for accepted cards.
Cards past the cap are dropped and reported like invalid ones.
See ASSISTANT-CARD-GENERATION.md (§How Cards Are Proposed).

### Retry

A retried run may call tools again.
Those calls see the decks and cards as they are now, not as they were at the original submit.
Tool activity is recorded again on the run, replacing the previous tool rows.

See ASSISTANT-CONVERSATIONS.md (§Retry) for retry availability and AI profile state.

### Models that cannot call tools

Every run offers the tools.
There is no injected-context fallback.
If the selected model cannot call tools, the provider error surfaces as a failed run.
The user can switch models and retry.

## Persistence

Tool activity and the elapsed time of each tool and reasoning row are saved with the run.
A row without a saved elapsed time shows none.
Activity that cannot be read blocks restore as corrupt, not as an empty conversation.
See ASSISTANT-CONVERSATIONS.md (§Restore).
When a crash interrupts a run, a tool call that was still running restores as failed.
A reasoning row that was still running restores as finished.
Neither keeps showing as running.
