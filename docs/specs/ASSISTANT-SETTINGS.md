# Assistant Settings

Covers assistant settings: the chat prompt template, variable expansion, live preview, temperature, and how saved values apply to later runs.
Does not cover AI profiles, secrets, model picking, conversation lifecycle, card proposal handling, or the streaming transport layer.
Those are covered by the AI providers, conversations, messages, and card-generation specs.

## What are Assistant Settings

Assistant settings are the user's global preferences for how the assistant talks to the model.
They live beside the chat UI and apply across conversations.
They do not belong to a single conversation.

The user toggles settings open from the assistant footer.
While settings are open, the settings form replaces the conversation view.
Closing settings returns to the conversation.
Whether settings are open is not remembered across reloads.

## Core Model

- **Chat prompt template** — the system prompt used for every run
- **Temperature** — sampling temperature sent with every run
- **Built-in defaults** — the product's default prompt text and temperature when the user has not saved a custom value
- **Compiled prompt** — the template after variables are expanded for the current deck template and provider

Relationships:

- Saved settings are global; every conversation reads the same values.
- Profile, model, and model parameters stay per conversation; see the conversations spec.
- The prompt template is compiled when a run starts and when the settings preview is shown.
- Card proposal behavior after the prompt is sent is covered by the card-generation spec.

## Prompt Template

There is one template.

It starts from a built-in default until the user customizes it.
The editor shows the effective text: the saved custom text, or the built-in default when none is saved.

The user can edit the template as free text.
Reset fills the editor with the built-in default text.
Preview and edit toggle for that template.
Preview is read-only.

Saving persists the template and temperature together.
Discard restores the last saved values.

An empty custom template is allowed and is sent as compiled empty content after trimming.
Invalid temperature is rejected on save; the previous saved settings remain unchanged.

A previously saved card-generation template is dropped on load.
It is not shown and not used.

## Variables

The template may include these placeholders:

- `{{fields}}` — expands to the active deck template's fields (id, title, type, required or optional)
- `{{rules}}` — expands to card-structure and content rules
- `{{provider}}` — expands to provider-specific format instructions when the provider needs them

Variables are optional.
The user can include none, some, or all of them.
Unrecognized text is left as written; only these three placeholders are replaced.

`{{provider}}` expands to nothing when there is no provider or when the provider does not need extra format instructions.
Otherwise it expands to that provider's format guidance.

The built-in default is plain text with no variables.
It tells the model to invent cards through `propose_cards` and not to ask the user for field titles.

Nothing about the user's decks is baked into the compiled prompt beyond those placeholders.

## Preview

Preview shows the compiled prompt for the current editor text.
It uses:

- the active conversation's deck template fields, when a deck and template are available
- the currently selected profile's provider

If no deck is selected, or the deck's template has no fields yet, `{{fields}}` expands to an empty field list.
Changing the deck, provider, or editor text updates the preview without saving.

Preview does not send a request to the model.

## Temperature

Temperature is a single slider from 0 through 2 in steps of 0.1.
The built-in default is 0.2.

Values outside 0–2 cannot be saved.

## How Settings Apply to Runs

A run uses the settings that are current when the run starts.
Changing settings does not rewrite past messages or past runs.

If the user has not saved a custom prompt, that run uses the built-in default.
If a custom prompt is saved, that text is compiled and used instead.

Temperature omitted or unset falls back to 0.2 for the run.

## Edge Cases

- Assistant settings are shared across all conversations; editing them in one place affects later runs everywhere
- Prompt-editor open/closed mode (edit vs preview) is local to the form session and is not persisted
- Settings-panel open state is local to the assistant view and is not persisted
- Saving does not start a run and does not change the active conversation's messages
- Profile secrets and model parameters are not part of assistant settings
- When the active deck's template later changes, later previews and runs expand `{{fields}}` and `{{rules}}` against the new template
