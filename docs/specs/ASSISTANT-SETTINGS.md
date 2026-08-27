# Assistant Settings

Covers assistant settings: the chat prompt template, temperature, and how saved values apply to later runs.
Does not cover AI profiles, secrets, model picking, conversation lifecycle, card proposal handling, or the streaming transport layer.
Those are covered by the AI providers, conversations, messages, and card-generation specs.

## What are Assistant Settings

Assistant settings are the user's global preferences for how the assistant talks to the model.
They live beside the chat UI and apply across conversations.
They do not belong to a single conversation.

The user toggles settings open from the assistant footer.
Closing settings returns to the conversation.
Whether settings are open is not remembered across reloads.

## Core Model

- **Chat prompt template** — the system prompt used for every run
- **Temperature** — sampling temperature sent with every run
- **Built-in defaults** — the product's default prompt text and temperature when the user has not saved a custom value

Relationships:

- Saved settings are global; every conversation reads the same values.
- Profile, model, and model parameters stay per conversation; see the conversations spec.
- Deck data is not injected into the prompt; see ASSISTANT-DATA-ACCESS.md.

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

## How the Prompt Is Sent

There are no placeholders.

The template is used as written after trimming.
Leftover brace placeholders in a previously saved custom prompt stay as literal text.

The built-in default is plain text with no variables.
It tells the model to invent cards through `propose_cards` and not to ask the user for field titles.

See ASSISTANT-DATA-ACCESS.md for how the model gets deck and field data.

## Temperature

Temperature is a single slider from 0 through 2 in steps of 0.1.
The built-in default is 0.2.

Values outside 0–2 cannot be saved.

## How Settings Apply to Runs

A run uses the settings that are current when the run starts.
Changing settings does not rewrite past messages or past runs.
Saving does not start a run and does not change the active conversation's messages.

If the user has not saved a custom prompt, that run uses the built-in default.
If a custom prompt is saved, that text is trimmed and used instead.

Temperature omitted or unset falls back to 0.2 for the run.
