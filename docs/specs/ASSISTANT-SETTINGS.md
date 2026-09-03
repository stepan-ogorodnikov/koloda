# Assistant Settings

Covers assistant settings: the system prompt, temperature, and how saved values apply to later runs.
Does not cover AI profiles, secrets, model picking, conversation lifecycle, card proposal handling, or the streaming transport layer.
Those are covered by the AI providers, conversations, messages, and card-generation specs.

## What are Assistant Settings

Assistant settings are the user's global preferences for how the assistant talks to the model.
They are edited in a modal over the assistant chat and apply across conversations.
They do not belong to a single conversation.

The user opens settings from the assistant footer.
The conversation stays visible behind the modal, including its title and header menu.
Closing the modal (close control, Escape, or the backdrop) discards unsaved edits.
Whether settings are open is not remembered across reloads.

## Core Model

- **System prompt** — the instructions sent with every run
- **Prompt source** — Default uses the live built-in prompt; Custom uses the user's saved text
- **Temperature** — sampling temperature sent with every run
- **Built-in defaults** — the product's default prompt text and temperature

Relationships:

- Saved settings are global; every conversation reads the same values.
- Profile, model, and model parameters stay per conversation; see the conversations spec.
- Deck data is not injected into the prompt; see ASSISTANT-DATA-ACCESS.md.

## Prompt Template

The user chooses a source: Default or Custom.

Default shows the current built-in prompt and is not editable.
The user can still select and copy the text.
Choosing Default does not erase a saved custom prompt.
The assistant uses the live built-in prompt, including later product updates to that text.

Custom shows the saved custom prompt and is editable.
If the user has never saved a custom prompt, switching to Custom copies the current built-in prompt into the editor as a starting point.
Switching back to Default leaves that custom text in place.
Discard restores the last saved source and custom text.

A custom prompt that happens to equal today's built-in text stays Custom.
It does not follow later product updates to the built-in prompt.
A previously saved custom prompt stays Custom until the user chooses Default.

There is no preview mode.

Saving persists the source, the custom prompt, and temperature together.
Discard restores the last saved values.

An empty custom prompt is allowed and is sent as empty after trimming.
Invalid temperature is rejected on save; the previous saved settings remain unchanged.

## How the Prompt Is Sent

There are no placeholders.

Default sends the current built-in prompt after trimming.
Custom sends the saved custom text after trimming.
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
Unsaved Default or Custom does not affect runs.

If the saved source is Default, that run uses the built-in prompt.
If the saved source is Custom, that text is trimmed and used instead.

Temperature omitted or unset falls back to 0.2 for the run.
