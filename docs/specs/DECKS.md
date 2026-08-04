# Decks

Covers decks: creating with defaults, editing title/algorithm/template, cascade delete, and how decks relate to cards, lessons, and the assistant.
Does not cover card browsing, reset progress, preview, lesson session flow, algorithm or template editing, or assistant conversation locking.
Those are covered by the cards, lessons, algorithms, templates, and assistant specs.

## What is a Deck

A deck is a titled collection of cards that shares one algorithm and one current template.
The algorithm schedules grades for cards in the deck.
The current template is used when the user adds cards manually or generates cards into this deck.
Existing cards keep the template they were created with even if the deck's template later changes.

## Core Model

- **Deck** — a titled collection with an algorithm and a current template
- **Algorithm** — the FSRS preset used when grading cards that belong to this deck
- **Current template** — the template offered for new cards added to this deck
- **Cards** — study units that belong to exactly one deck

Relationships:

- Every card belongs to one deck and cannot be moved to another deck.
- Cards do not store an algorithm of their own; they use the deck's algorithm at grade time.
- Each card stores its own template id; changing the deck's template does not rewrite existing cards.
- Deleting a deck deletes its cards and those cards' review history.
- Learning settings defaults supply the algorithm and template suggested when creating a deck.
- Lessons can target one deck or all decks; available counts are computed per deck.
- The assistant can open with a deck already selected; locking and generation are covered by the assistant specs.

## Adding Decks

The user adds a deck by giving it a title and choosing an algorithm and a template.

If the user does not pick otherwise, the algorithm and template pickers fall back to the learning settings defaults.
The title is required and limited in length.
An empty title is rejected.
The chosen algorithm and template must already exist; otherwise add fails and nothing is created.

After a successful add, the dialog offers a link to open the new deck.
Changing the form again clears that success state so another add can be submitted.

Adding a deck creates no cards.

## Editing Decks

Each deck has two tabs: **Cards** and **Details**.
**Cards** is the default tab and is covered by the cards spec.
**Details** edits the deck itself.

On Details the user can change:

- **Title**
- **Algorithm**
- **Template**

Saving persists title, algorithm, and template together.
Discard restores the last saved values.

Changing the algorithm affects future grading for cards in this deck.
It does not rewrite existing card due times, scheduling numbers, or review history.

Changing the template changes which template is used for newly added cards.
It does not rewrite existing cards onto the new template.
Those older cards keep their own templates until edited or deleted individually.

Invalid values are rejected on save.
The previous saved deck remains unchanged.

Opening a missing or invalid deck id shows not found.

## Deleting Decks

Delete asks for confirmation.
The confirmation states that the deck and all of its cards and reviews will be removed.

On success:

- the deck is deleted
- every card in the deck is deleted
- every review belonging to those cards is deleted
- the user is returned to the decks list

Delete is always available for an existing deck.
There is no “last deck” or default-deck protection.

Deleting a deck does not delete algorithms or templates.
A template that was only referenced by this deck's cards may become unlocked after those cards are gone.
A template or algorithm that was only referenced as this deck's current choice becomes free of that deck reference.

## Listing and Navigation

Decks appear in a sidebar list ordered by creation time.
Each entry opens that deck.

From the cards toolbar the user can open the assistant with this deck already selected.
How generation and deck locking work once there is covered by the assistant specs.

Elsewhere in the app, a deck picker lists the same decks.
When a non-empty selection is required and none is chosen yet, the first deck in the list is selected.

## Edge Cases

- Two decks may have the same title; they remain distinct
- Cards cannot be moved between decks
- An empty library with no decks is allowed
- Failed add or update does not partially create or change a deck
- Changing learning-settings defaults never rewrites existing decks
- Deleting a deck does not rewrite assistant conversations that still point at its id
- Lesson counts for a deleted deck disappear with the deck; other decks are unaffected
