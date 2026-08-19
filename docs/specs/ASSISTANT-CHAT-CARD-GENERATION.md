# Assistant Chat: Card Generation

Covers how the AI proposes flashcard content during chat, how proposed cards are displayed, selected, and added to a deck, and how invalid proposals are handled.
Does not cover conversation lifecycle, assistant settings editing, or the streaming transport layer.
Prompt templates and temperature are covered by the assistant settings spec.
How the model reads decks and cards is covered by the data-access spec.

## What is Card Generation

Card generation is the process where the AI invents structured flashcard data from a user prompt.
The user asks in chat to generate, create, make, add, or invent cards — including a random card.
The model proposes cards through a tool, and accepted cards appear as a table in that same turn.
The user can then select which cards to add to the deck the proposal targeted.

This is not a separate chat mode.
There is no toggle to switch into card generation.
A request to pick or retrieve an existing card is not card generation.

Card generation happens inside a chat run.
It goes through the same lifecycle: streaming, success, failure, cancellation, or interruption.

## Card Structure

Each proposed card has a value for each field in the target deck's template.
A card with no values across all fields is discarded.
A card with at least one field value is kept.

## How Cards Are Proposed

The model must call `propose_cards` to create new cards.
Listing decks or listing existing cards does not create cards.
Writing cards as a markdown table does not create cards.

If the model lacks a deck id or field titles, it lists decks itself in the same turn.
It does not ask the user for those.
It uses `get_deck_cards` only to inspect existing cards, for example to avoid duplicates.
Field titles come from the deck list, not from listing cards.

Each proposed card is a map of exact template field title to invented text.
The write target is the deck id and template id on that tool call.

An empty proposal does not create a review table.
Invalid cards and cards past a 200-card cap are dropped from the accepted list.
If the tool accepts 0 cards, the result tells the model to call `propose_cards` again with the titles from that result.
The run itself is not failed by an empty or invalid proposal.

Common title mismatches still accept when the text can be matched.
That includes missing field wrappers, values wrapped as text objects, case-insensitive titles, or field ids.
The first accepted proposal on a run sets that run's write target and field titles.
A later proposal for a different deck is ignored for the table.
A later proposal for the same deck appends more cards.

## Card Display

Accepted cards appear as a table on the same assistant message as the rest of that turn.

The table has a selection column and one column per template field.
All rows are initially selected.

On a chat turn that proposed cards, the table sits below any tool activity and above leftover assistant text.
Once cards are on screen, the pending status is not shown on the table.
It attaches below the table until leftover text arrives.

On success, the table and an elapsed time display appear with the rest of the turn.
On cancellation, the cards received before cancellation remain visible with a canceled status.
On failure, the partial cards remain visible with a failed status and a retry button.

If the template used for generation no longer exists (for example, after restoring a conversation from a previous session), a synthetic template is created from the stored field definitions.
The table still renders, but the template is marked as unavailable.

If no cards were accepted, the review table is not shown.

Historical turns that were saved as card-generation messages still render as a table.
The table is those stored cards, not whether the run was recorded as chat or cards.

## Card Status

Each card in a generation run has an independent status.
The status transitions are:

**idle** → **pending** → **success** | **error**

- **idle**: the card was generated and is available for selection
- **pending**: the card is being added to the deck
- **success**: the card was successfully added to the deck
- **error**: adding the card to the deck failed

Status is per-card, not per-run.
Some cards in a run can succeed while others fail.

When a run is restored from the database, any cards with pending status are reset to idle.

## Card Selection

The user selects cards to add to the deck using checkboxes in the selection column.
Only cards in idle status are selectable.
Cards that are pending, succeeded, or errored cannot be toggled.

The select-all checkbox in the header reflects the selection state of idle rows:
it is checked when all idle rows are selected, indeterminate when some are selected, and unchecked when none are selected.
The select-all checkbox is hidden when there are no idle rows.

Initially, all generated cards are selected.

## Adding Cards to Deck

When the user presses the add button, the selected cards are transformed and sent to the write-target deck with the write-target template.

For a chat proposal, that deck and template are the ones from `propose_cards`.
If either write target is missing, add is disabled.

Before the request is sent, all selected cards are marked as pending.
On success, each card is individually marked as success or error based on the per-card result from the server.
On a network error, all selected cards are marked as error.

After a successful add, the deck's card list is refreshed and the assistant settings query is invalidated.
The selection is cleared — all rows are deselected.

The add button is disabled when:

- Cards are currently being added
- No cards are selected
- There is no write-target deck
- There is no write-target template

## Conversation History

When a new message is sent, successfully generated cards from previous runs are included in the conversation history sent to the AI.
The cards are serialized in markdown format: each card becomes a heading `## Card N` followed by `**Field Title**: value` lines.

A chat turn that proposed cards is sent as those serialized cards, then any leftover assistant text from that run.
Failed or canceled card outputs are not included.
Card outputs that are not displayed are not included.

## Retry

A failed, canceled, or interrupted run that proposed cards can be retried.
Retry is always a chat run with tools.
It clears the previous cards and tool rows and streams a new response from scratch.
The model may call `propose_cards` again.
The conversation history sent to the AI is rebuilt from the current state, including all previously successful runs.
Retry is only available on the most recent message pair.

## Edge Cases

- If the template no longer exists when a previous conversation is restored, a synthetic template is created from stored field data so the table can still render
- A markdown table in the assistant text does not become reviewable cards
- An accepted list of 0 cards does not set a write target
