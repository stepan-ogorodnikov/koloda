# Cards

Covers card content, scheduling state, adding, editing, deleting, resetting progress, preview, and card views.
Does not cover deck or template management, lesson flow, the FSRS algorithm itself, or AI card generation.
Accepting generated cards into a deck is covered; how those cards are generated is not.

## What is a Card

A card is a unit of study inside a deck.
It carries user-visible content shaped by a template, plus scheduling state that determines when it comes up for review.
A card belongs to exactly one deck and uses exactly one template.

## Core Model

- **Card** — the unit of study; has content, a deck, a template, and scheduling state
- **Card state** — where the card sits in the spaced-repetition flow (see [Card State](#card-state))
- **Card content** — values for each field of the card's template, stored as text
- **Scheduling data** — numbers that drive when the card comes up next, populated by the algorithm

Relationships:

- A card's template defines the fields its content must have.
- A card's deck's algorithm defines the scheduling data.
- Grading a card updates its state, scheduling data, and due time, and creates a review record.
- Manual add uses the deck's current template.
- If the deck's template later changes, existing cards keep their old template; table, edit, and preview resolve the template per card.

## Card Content

A card's content is a set of text values, one per field on its template.

Required fields must have a non-empty value.
Optional fields accept an empty value.
Every field of the template must be present in the content.

In the management UI, every field is edited and shown as plain text, including markdown fields.
Rendered markdown appears only in preview and lessons.

Having any card on a template locks that template's field structure.
The locking rules themselves are part of template management.

## Card State

A card's state is one of four values, set by the algorithm based on its review history:

- **untouched** — never graded; no due time, no scheduling numbers
- **learn** — currently in its first learning phase
- **review** — graduated from learning and on the review schedule
- **relearn** — failed out of review and re-learning the card

A card's state is visible in the card views and on the card details view.
The state's visual style changes as it moves between phases.

## Scheduling Data

Each card carries the scheduling numbers the algorithm uses to compute its next due time.
A card with no state has zero values and no due time.
A card that has been graded has a due time and populated values for each scheduling field.

On the card details view, the user sees stability, difficulty, and lapses, plus the due time when one is set.
The remaining scheduling fields are not shown in the management UI.

The user does not edit these numbers directly, except through resetting progress.

## Adding Cards

The user adds a card to a deck through a dialog that shows a text area for each field of the deck's current template.
The user cannot pick a different template when adding manually.

- Each required field must be filled before the card can be saved.
- Empty optional fields are allowed.
- Without a template, the card cannot be added.
- After a successful add, the form is cleared and stays open so the user can add another card.
- Closing the dialog discards the draft.

### Batch Add

Cards can also be added in a batch, typically from generated content.
A batch may contain cards that use different templates.

Each card in the batch is validated against its own template.
A single invalid card does not abort the batch — other cards are still saved.
The result reports per-card success or error.

If a card's template no longer exists, that card fails to add.
Other cards in the batch with valid templates still succeed.

## Editing Cards

The card details view shows the card's editable content and its state.
If the card has been graded, it also shows the due time, the visible scheduling numbers, review history, and a reset action.
It always shows creation and update timestamps and a delete action.

Editing only changes the content.
The card's deck, template, state, and scheduling data are not modified.

Submitting a blank required field is rejected.
Submitting a valid change updates the card and refreshes the card views.

Without the card's template, the content cannot be edited.

## Review History

Graded cards show a review history on the details view.
Each entry is a timestamp and a grade.
Untouched cards have no review history section.

Resetting progress or deleting the card removes the history.

## Deleting Cards

The user can delete a single card or a selected group of cards.
Delete asks for confirmation.
Deleting is irreversible from the user perspective.
The card's review history is removed with it.

If the user selects zero cards, the bulk delete is not available.
The deck itself is not deleted by removing its cards.

## Resetting Progress

The user can reset a graded card's progress back to a fresh state.
The card's content stays the same; only its scheduling is wiped.

- Every scheduling field is reset to its default value.
- The card's full review history is removed.
- The card becomes indistinguishable from a freshly added card, except for its creation time and content.

Reset is only available on cards that have been graded.
Reset does not ask for confirmation.

## Card Preview

The user can preview a card without saving any changes.
Preview renders the card against its template the same way a lesson does — field operations, submit, reveal, and typed-answer comparison behave as in a lesson.

Preview does not grade the card, does not save content typed in the preview, and does not create a review.

## Card Views

The user can switch between two ways to browse a deck's cards: a table view and a stack view.
The chosen view is remembered while the app stays open; it is not persisted across reloads.

On narrow screens the stack view is forced and the view toggle is hidden.

From the cards toolbar the user can open the assistant with this deck already selected.
How generation works once there is covered by the assistant specs.

### Table View

The table view shows every card in a paginated, sortable table.
Each row shows the card's content, its state, its due time (if scheduled), and timestamps for creation and last update.
Content cells show raw text, not rendered markdown.
Per-row actions let the user preview, edit, or delete the card.

When cards in the deck use more than one template, content columns are aligned by field position.
If titles at a position agree, that title is the column header; otherwise the header is a positional label.
Each cell resolves the value through that card's own template.

The table supports:

- selecting individual cards, or all cards on the current page at once
- bulk delete on the selected cards
- filtering by state, by due status (overdue or not yet due), and by template when more than one template is in use
- full-text search across the card content
- showing, hiding, and reordering columns
- pagination with a chosen page size

### Stack View

The stack view shows one card at a time using the card details view.
The user moves between cards with previous and next buttons.
A counter shows the current position and the total number of cards.
There is no filtering, selection, or pagination in the stack view.

## Edge Cases

- Two cards with identical content are still two distinct cards
- A card's template cannot be deleted while the card exists
- The card's update timestamp bumps only on content changes; grading and resetting progress leave it untouched
- Changing the deck's template does not rewrite existing cards onto the new template
- An untouched card has no due time and matches "not yet due", not "overdue"
