# Algorithms

Covers algorithm presets: parameters, adding, cloning, editing, and deleting with a successor.
Does not cover FSRS scheduling math, how grades update card state, or learning settings UI.
How decks pick an algorithm is covered lightly; deck management itself is not.

## What is an Algorithm

An algorithm is a named FSRS parameter set used by decks when scheduling cards.
The product lists these under Presets.
Each deck points at one algorithm.
Editing an algorithm, or pointing a deck at a different algorithm, changes the parameters used for later grades.
It does not rewrite existing card scheduling numbers until those cards are graded again.

## Core Model

- **Algorithm** — a titled FSRS preset
- **Parameters** — retention, weights, fuzz, learning steps, relearning steps, and maximum interval
- **Successor** — another algorithm that takes over decks when one is deleted

Relationships:

- A deck stores which algorithm to use and uses that algorithm's current parameters when grading.
- Cards do not store an algorithm of their own; see DECKS.md (§Relationships).
- See LEARNING-SETTINGS.md (§Defaults) for the default algorithm offered when creating a deck.
- At least one algorithm must remain; the last algorithm cannot be deleted.

## Parameters

Every algorithm is FSRS and has:

- **Title** — required, limited in length
- **Retention** — integer from 70 through 99
- **Fuzz** — on or off
- **Weights** — exactly twenty-one comma-separated numbers
- **Learning steps** — ordered delays used while a card is in learning
- **Relearning steps** — ordered delays used while a card is in relearning
- **Maximum interval** — number of days; must be greater than zero

Each learning or relearning step is an amount and a unit.
Units are seconds, minutes, hours, or days.
The amount must be at least one.
Either step list may be empty.

Adding a step copies the previous step when one exists.
Otherwise it uses the built-in default first step for that list.
Steps can be removed individually.

Invalid parameters are rejected on save.
The previous saved algorithm remains unchanged.

## Adding Algorithms

The user adds an algorithm by giving it a title.
Two algorithms may have the same title; they remain distinct.
The new algorithm starts from the built-in FSRS defaults for all parameters.

After a successful add, the dialog offers a link to open the new algorithm.
Changing the title again clears that success state so another add can be submitted.

An empty title is rejected.

## Cloning Algorithms

The user can clone any algorithm.
Clone asks for a new title and copies the source parameters into an independent algorithm.

Clone does not copy decks.
After success, the dialog offers a link to open the clone.

Cloning a missing source fails and creates nothing.

## Editing Algorithms

The algorithm editor shows timestamps, title, parameters, and actions.
Saving persists title and parameters together.
Discard restores the last saved values.

Changing parameters affects future grading for decks that use this algorithm.
It does not immediately rewrite card due times or review history.
The learning settings default algorithm can be edited while it remains the default.
See LEARNING-SETTINGS.md (§Defaults).

## Deleting Algorithms

Delete asks for confirmation.
On success the user is returned to the algorithms list.

Delete is unavailable when either of these is true:

- the algorithm is the learning settings default; see LEARNING-SETTINGS.md (§Defaults)
- it is the only algorithm left

Changing the learning settings default elsewhere is what makes a former default deletable again.

When no decks use the algorithm, confirm deletes it directly.

When one or more decks use it, the user must choose a successor algorithm.
Confirm reassigns every deck that pointed at the deleted algorithm to the successor, then deletes the algorithm.
The successor picker defaults to the first other algorithm.
If the successor is missing or invalid, delete fails and decks are left unchanged.

Deleting an algorithm does not delete decks or cards.
