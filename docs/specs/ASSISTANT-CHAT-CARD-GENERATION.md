# Assistant Chat: Card Generation

Covers how the AI generates flashcard content, how generated cards are displayed, selected, and added to a deck, and the strategies used to parse AI output into structured card data.
Does not cover deck management, conversation lifecycle, mode switching, or the streaming transport layer.

## What is Card Generation

Card generation is the process where the AI produces structured flashcard data from a user prompt.
The user types a request in cards mode, the AI generates one or more cards, and the cards appear as a table in the conversation.
The user can then select which cards to add to the active deck.

Card generation is triggered as a run, like any other AI request.
It goes through the same lifecycle: streaming, success, failure, or cancellation.

## Card Structure

Each generated card has a value for each field in the active template.
A card with no values across all fields is discarded.
A card with at least one field value is kept.

## Generation Prompt

The system prompt sent to the AI includes:

- A description of each field (ID, title, type, whether it is required)
- Rules for card structure and content
- Provider-specific format instructions when the provider does not support structured output

The system prompt is compiled from a user-customizable template.
The user can edit the template in assistant settings and preview the compiled result.

The template supports three variables that are replaced when the prompt is sent:

- `{{fields}}` — expands to a list of the template's fields with their titles, types, and whether they are required
- `{{rules}}` — expands to the rules for card structure and content
- `{{provider}}` — expands to provider-specific format instructions (only included when the provider needs them)

Variables are optional — the user can include only the ones they need.

The temperature for generation defaults to 0.2 but can be configured in assistant settings.

## Generation Behavior

Cards stream in one at a time as they are generated.
The user sees each card appear individually.

If the AI's response cannot be parsed into cards, the system automatically retries with a different approach.
This happens transparently — the user does not need to take any action.

Different providers may handle the request differently, but the system abstracts over these differences.
The user experience is the same regardless of which provider is used.

## Output Parsing

The system extracts card data from whatever the AI returns.
It tries multiple strategies and merges the results.

If the AI returns structured data, the system validates it against the template fields and extracts cards from it.
If the AI returns free-form text, the system looks for card-like content and attempts to match labels to fields.

Labels from the AI response are matched to template fields even if they do not match exactly.
If a label cannot be matched to any field, the system falls back to positional ordering.

A block must produce at least one non-empty field value to be kept as a card.
If no cards can be extracted in any format, the user sees a "no cards generated" message.

## Card Display

After generation completes, cards appear as a table in the conversation.

The table has a selection column and one column per template field.
All rows are initially selected.

While generation is in progress, the message shows a pending indicator.
On success, the table and an elapsed time display appear.
On cancellation, the cards received before cancellation remain visible with a canceled status.
On failure, the partial cards remain visible with a failed status and a retry button.

If the template used for generation no longer exists (for example, after restoring a conversation from a previous session), a synthetic template is created from the stored field definitions.
The table still renders, but the template is marked as unavailable.

If no cards were generated at all, a message indicating zero cards is shown instead of the table.

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

When the user presses the add button, the selected cards are transformed and sent to the deck.

Before the request is sent, all selected cards are marked as pending.
On success, each card is individually marked as success or error based on the per-card result from the server.
On a network error, all selected cards are marked as error.

After a successful add, the deck's card list is refreshed and the assistant settings query is invalidated.
The selection is cleared — all rows are deselected.

The add button is disabled when:
- Cards are currently being added
- No cards are selected

## Conversation History

When a new message is sent, successfully generated cards from previous runs are included in the conversation history sent to the AI.
The cards are serialized in markdown format: each card becomes a heading `## Card N` followed by `**Field Title**: value` lines.

Failed or canceled card generation outputs are not included.
Card outputs that are not displayed are not included.
This ensures the AI receives a clean history of what the user actually saw.

## Retry

A failed or completed card generation run can be retried.
Retry clears the previous cards and streams new ones from scratch.
The conversation history sent to the AI is rebuilt from the current state, including all previously successful runs.
Retry is only available on the most recent message pair.

## Edge Cases

- If the template no longer exists when a previous conversation is restored, a synthetic template is created from stored field data so the table can still render
