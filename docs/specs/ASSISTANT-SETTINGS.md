# Assistant Settings

Covers assistant settings: the chat prompt template, temperature, and how saved values apply to later runs.
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

Relationships:

- Saved settings are global; every conversation reads the same values.
- Profile, model, and model parameters stay per conversation; see the conversations spec.
- When a run starts, the saved custom prompt (or the built-in default) is trimmed and sent as the system message.
- Card proposal behavior after the prompt is sent is covered by the card-generation spec.

## Prompt Template

There is one template.

It starts from a built-in default until the user customizes it.
The editor shows the effective text: the saved custom text, or the built-in default when none is saved.

The user edits the template as free text in a single editor.
There is no preview mode.
Reset fills the editor with the built-in default text.

Saving persists the template and temperature together.
Discard restores the last saved values.

An empty custom template is allowed and is sent as empty after trimming.
Invalid temperature is rejected on save; the previous saved settings remain unchanged.

A previously saved card-generation template is dropped on load.
It is not shown and not used.

## How the Prompt Is Sent

There are no placeholders.

The template is used as written after trimming.
Leftover `{{fields}}`, `{{rules}}`, `{{provider}}`, or other brace text in a previously saved custom prompt stays as literal text.

The built-in default is plain text with no variables.
It tells the model to invent cards through `propose_cards` and not to ask the user for field titles.

Nothing about the user's decks is baked into the system prompt.
Field titles reach the model through tools (`list_decks`, `propose_cards`).

## Temperature

Temperature is a single slider from 0 through 2 in steps of 0.1.
The built-in default is 0.2.

Values outside 0–2 cannot be saved.

## How Settings Apply to Runs

A run uses the settings that are current when the run starts.
Changing settings does not rewrite past messages or past runs.

If the user has not saved a custom prompt, that run uses the built-in default.
If a custom prompt is saved, that text is trimmed and used instead.

Temperature omitted or unset falls back to 0.2 for the run.

## Edge Cases

- Assistant settings are shared across all conversations; editing them in one place affects later runs everywhere
- Settings-panel open state is local to the assistant view and is not persisted
- Saving does not start a run and does not change the active conversation's messages
- Profile secrets and model parameters are not part of assistant settings
- Leftover placeholder text in a saved custom prompt is sent as written; it is not expanded from a deck template
