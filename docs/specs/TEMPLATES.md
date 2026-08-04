# Templates

Covers template structure, fields, layout, locking, adding, cloning, editing, and deleting.
Does not cover how cards store content, how lessons render fields during study, or learning-settings defaults UI.

## What is a Template

A template defines the shape of card content and how that content appears during study.
It has a title, a list of fields, and a layout that maps those fields to study operations.
Decks and cards reference templates; cards keep the template they were created with.

## Core Model

- **Template** — named content shape used by cards
- **Field** — one content slot: title, type, and whether it is required
- **Layout item** — one study presentation of a field: which field, and which operation
- **Lock** — whether any card currently uses the template

Relationships:

- Every template has at least one field and at least one layout item.
- Each layout item points at a field that exists on the same template.
- A deck has a current template used when adding cards manually.
- A card stores its own template id; changing a deck's template does not rewrite existing cards.
- Lock is derived from cards: any card on the template locks it; deleting the last such card unlocks it.

## Fields

Each field has:

- a title
- a type — **text** or **markdown**
- a required flag

Fields can be reordered.
Adding a field also adds a matching layout item with the **display** operation.
Removing a field also removes every layout item that pointed at it.

A template must keep at least one field.

## Layout

The layout is an ordered list of items.
Each item chooses a field and an operation:

- **display** — visible immediately during study
- **reveal** — hidden until the card is submitted
- **type** — the user types an answer before submit

Layout order is independent of field order.
Reordering fields does not reorder layout items, and the reverse is also true.

Layout items can be reordered.
Their operations can be changed at any time, including when the template is locked.

How operations behave during study is covered by the lessons spec.
A template must keep at least one layout item.
Every layout item must reference an existing field.

## Locking

A template is locked when at least one card uses it.
It is unlocked when no cards use it.
The editor shows the current lock status.

While locked:

- Existing fields cannot be removed.
- Existing fields cannot change type or required.
- Field titles can still be changed.
- The template title can still be changed.
- Fields and layout may still be reordered.
- Layout operations may still be changed.
- The template cannot be deleted.

While unlocked, fields and layout can be edited freely, subject to the minimum counts above.

Saving a locked template rejects removing existing fields or changing their type or required flag.

## Adding Templates

The user adds a template by giving it a title.
The new template starts from the built-in default shape: two required text fields ("Front" and "Back"), with Front displayed and Back typed.

After a successful add, the dialog offers a link to open the new template.
Changing the title again clears that success state so another add can be submitted.

## Cloning Templates

The user can clone any template, including a locked one.
Clone asks for a new title and copies the source fields and layout into an independent template.

The clone starts unlocked if it has no cards of its own.
After success, the dialog offers a link to open the clone.

## Editing Templates

The template editor shows timestamps, title, lock status, fields, layout, and actions.
Saving persists title, fields, and layout together.
Discard restores the last saved values.

The template title is required and limited in length.
Empty field titles are allowed.

When the template is locked, the editor disables changing field type and required, and hides add-field and remove-field controls.
Title edits, field-title edits, reorder, and layout edits remain available.

## Deleting Templates

Delete asks for confirmation.
On success the user is returned to the templates list.

Delete is unavailable when any of these is true:

- the template is locked (cards still use it)
- the template is the learning-settings default template
- any deck currently uses the template

Each blocked reason is explained to the user.

Deleting a template does not delete decks or cards; those references must be cleared first by changing or removing them elsewhere.

## Edge Cases

- Two templates may have the same title; they remain distinct
- Cloning does not copy cards, decks, or lock status from the source
- Unlocking happens only when the last card that used the template is deleted
- A deck may point at a template that no longer matches the templates of its older cards
- Layout may list a field more than once only if the editor allows it; each item still needs a valid field id
- The default learning-settings template can be edited, but it cannot be deleted while it remains the default
