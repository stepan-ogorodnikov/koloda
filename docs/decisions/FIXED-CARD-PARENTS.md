# Fixed card parents

## Ruling

- A card's deck and template are set when the card is created and never change.
- `cards.deck_id` and `cards.template_id` are written only by card creation.
  No update path in either store, and no sync update group, writes them.
- A feature that moves a card to another deck, or changes a card's template, must first replace this ruling.
  The replacement names how deleting a deck or template then reaches the card:
  cascade by the deck and template at creation (a card moved out still dies with its first deck),
  per-card tombstones on deck delete, or the server reporting dead cards to devices.

## Why

Sync cascades a deck or template delete to cards by the deck and template recorded when each card was created
(`crates/koloda-sync-proto/PROTOCOL.md` §Deletes).
That keeps a 50k-card deck delete to one envelope.
If a card could change deck, devices would disagree about which cards a delete covers.
The product already says a card cannot be moved (`docs/specs/CARDS.md`); this ruling is what depends on it.

## Applies when

- A change lets a card move between decks or change its template, in a spec, either store, or the UI.
- A change adds a write to `cards.deck_id` or `cards.template_id` outside card creation.
- Not needed for card content, scheduling, or reset changes that leave deck and template alone.
