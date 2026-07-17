# Lessons

Covers lessons overview, starting a lesson, amount selection, studying, grading, learn-ahead, progress, result persistence, completion, and early termination.
Does not cover deck or template editing, FSRS algorithm internals, learning settings UI, or hotkey binding configuration.

## What is a Lesson

A lesson is a study session.
The user picks how many cards of each type to study, then works through them one by one.
For each card the user reveals or types answers, then grades the card.
Each grade updates the card's scheduling and records a review.

A lesson can target one deck or all decks at once.
It runs in a modal dialog that blocks keyboard dismissal.
Closing the dialog clears the session.

## Core Model

- **Card type** — how a card is counted for study:
  - **New** — cards that have never been reviewed
  - **Learn** — cards currently in learning or relearning that are due
  - **Review** — cards in review that are due
  - **Total** — the sum of the three types above
- **Available counts** — cards of each type ready to study now, per deck and across all decks
- **Amounts** — how many cards of each type the user chose for this lesson
- **Daily limits** — caps on how many cards of each type, and in total, may be studied today
- **Lesson data** — the session's cards, plus the decks, templates, and algorithms they need
- **Current card** — the card being studied, with its template layout, answer form, and grade options
- **Progress** — how many cards of each type are done versus still pending in this session
- **Upload queue** — graded results waiting to be saved, one at a time

Relationships:

- Available counts come from the user's decks and due times.
- Amounts are chosen at init, then used to load lesson data.
- Each card in the session uses its deck's template and algorithm.
- Grading a card enqueues a result for persistence and advances to the next card.

## Lessons Overview

The lessons screen lists every deck with available counts for "New", "Learn", "Review", and "Total".
A final row aggregates the same counts across all decks.

On wide screens the list is a table.
On narrow screens it is a stacked list with the same counts.

Each count is a badge.
A badge with a non-zero count starts a lesson of that type for that deck (or for all decks on the aggregate row).
A badge with zero is disabled and shows "0".

## Starting a Lesson

Clicking an enabled badge opens the lesson dialog.
The click carries a lesson type and an optional deck.

If a deck is set, the lesson is filtered to that deck.
If no deck is set, the lesson includes cards from all decks.

Opening a lesson disables navigation hotkeys for the duration of the dialog.
Closing the lesson restores them and refreshes the available counts and today's review totals.

While the lesson dialog is open, Escape and the "Close popover" hotkey have the same effect.
What that effect is depends on the current phase (init, studying, or completion).

Only one lesson dialog can be active.
If a lesson is already open, a second start request is ignored.

## Init

Before studying begins, the user sees an init screen.
It shows, for each card type:

- the amount that will be studied
- how many cards of that type are available
- how many have already been studied today, with the daily limit when one is set

"New", "Learn", and "Review" amounts are editable number fields.
Each field is capped at the available count for that type.
The "Total" amount is the sum of the three and is not edited directly.

The "Start" button is disabled while the "Total" amount is zero.
Escape or "Close popover" closes the dialog without starting.

### Default Amounts

Defaults are computed once available counts and today's review totals are loaded.
They respect both per-type daily limits and the total daily limit.

For each type, the default is the minimum of:

- cards available of that type
- remaining room under that type's daily limit
- remaining room under the total daily limit, when that type counts toward "Total"

If the user opened the lesson from a specific type badge (not "Total"), only that type gets a non-zero default.
The other types start at zero.
The user can still raise any type before starting.

If the user opened from the "Total" badge, defaults fill "New", then "Learn", then "Review".
Each type that counts toward "Total" consumes remaining "Total" allowance as it goes.
Types that do not count toward "Total" leave that allowance untouched.

A daily limit value of zero is treated as no cap for that limit.

Editing an amount after defaults are set recalculates "Total".
Manual edits are not re-clamped to daily limits — only to the available count for that type.

## Studying

When the user starts the lesson, cards are loaded for the chosen amounts and filters.

Cards are included in this order:

1. "New" cards, oldest first
2. "Learn" cards that are due, soonest due first
3. "Review" cards that are due, soonest due first

Each card is shown using its deck's template layout.
The layout is an ordered list of fields.
Each field has an operation that controls how it appears during study.

While a card is active, the header shows progress amounts and progress dots.
The footer shows either the "Continue" button or the grade buttons, depending on whether the card has been submitted yet.

### Field Operations

- **display** — the field value is visible immediately
- **reveal** — the field is hidden until the card is submitted, then it appears
- **type** — the user types an answer before submit

Text fields support all three operations.
For a type field, the user edits in a text area.
The first type field in the layout is focused automatically.
Enter without modifiers submits the card from a type field.

After submit, a typed text answer is compared to the real value.
Comparison ignores leading and trailing whitespace and letter case.
If they match, the typed answer is shown as correct.
If they do not match, the typed answer is shown as incorrect and the correct value is shown below it.

Markdown fields are rendered as formatted content.
They participate in reveal visibility through the layout, but they do not present a typing input.

If every field in the layout is display-only, there is nothing to submit.
The card is treated as already submitted and grade buttons appear immediately.

### Submitting a Card

While the card is not yet submitted, the footer shows "Continue".
Pressing "Continue" submits the card.
Enter or Space also submit, unless focus is in a text input or textarea — then those single-key shortcuts are ignored.
From a type field, Enter without modifiers still submits the card.
Space in a type field inserts a space.

Submit reveals hidden fields, swaps type inputs for the answer comparison, and shows the grade buttons.

Submit does nothing if the card is already submitted.

If there is no type field to focus, "Continue" is focused when the card appears.

## Grading

After a card is submitted, the footer shows four grades: "Again", "Hard", "Good", and "Easy".
Each button shows how soon the card would be due if that grade is chosen.
"Good" is focused by default.

Choosing a grade:

1. Records how long the card was on screen, capped at one hour
2. Builds the updated card schedule and a review entry from the chosen grade
3. Queues that result for persistence
4. Advances to the next card, or finishes the lesson if none remain

Grade hotkeys fire on key release while studying.
They use the configured "Again", "Hard", "Good", and "Easy" bindings.

### Learn Ahead

After a grade, the updated card may be appended back onto the end of the current lesson.
That happens when learn-ahead is configured and the card's new due time falls before the cutoff from now.

The appended card is studied later in the same session, after cards already queued.
If learn-ahead is unset, the card has no due time, or the due is at or after the cutoff, it is not appended.

## Progress

While studying, the header shows two summaries:

- done counts on one side — "New", "Learn", "Review", and their sum
- pending counts on the other — "Total" first, then the per-type breakdown

Progress dots represent every card currently in the session, including cards appended by learn-ahead.
The current card is highlighted.
Dots scroll so the current card stays centered.

Each finished card's dot reflects upload status:

- success when the result was saved
- error when saving failed
- a plain marker while still pending or not yet graded
- a play marker on the current card before it has an upload status

## Persisting Results

Graded results upload one at a time from a queue.
A successful upload removes the item from the queue and marks that card's progress dot as success.
A failed upload also removes the item from the queue and marks the dot as error.
There is no automatic retry of a failed upload from the lesson UI.

Already-uploaded results remain saved even if the user later abandons the lesson.

Closing the lesson clears the in-memory queue and upload log.
It does not roll back results that already succeeded.

## Completion

When every card in the session has been graded, the lesson is finished.
The content area shows "Done".
The footer shows "Close", focused by default.
Escape or "Close popover" also closes the dialog.

## Early Termination

During studying, closing the lesson requires confirmation.
That includes the dialog close control, Escape, and "Close popover".

The confirmation offers "Continue studying" or "Close".
"Continue studying" dismisses the confirmation and leaves the current card as it was.
"Close" ends the lesson immediately.

On the init and completion screens, close, Escape, and "Close popover" end the lesson without that confirmation.

Ending a lesson mid-study does not undo grades that already uploaded successfully.
Cards that were graded but not yet uploaded are discarded with the cleared session state.

## Edge Cases

- A badge with count zero cannot start a lesson
- "Start" is disabled when the chosen "Total" amount is zero
- If lesson data loads with no cards, studying never begins and no current card is shown
- Opening a lesson while one is already open does not replace the active session
- Daily limits shape init defaults; the user can still raise amounts up to what is available
- A daily limit value of zero does not block cards; it is treated as no cap
- Review time spent on a card never exceeds one hour in the saved review
- Learn-ahead can make the session longer than the amounts chosen at init
- Progress counts follow each card's scheduling state when it appears in the session list
- Upload errors are visible on progress dots but are not retried from the lesson UI
- Keyboard dismissal of the lesson dialog is disabled — close via the close control, Escape, "Close popover", or completion "Close"
- Navigation hotkeys stay disabled for the whole time the lesson dialog is open
