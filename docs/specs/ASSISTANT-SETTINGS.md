# Assistant Settings

Covers assistant settings: chat and card-generation prompt templates, variable expansion, live preview, temperature, and how saved values apply to later runs.
Does not cover AI profiles, secrets, model picking, conversation lifecycle, card parsing, or the streaming transport layer.
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

- **Chat prompt template** — the system prompt used for chat-mode runs
- **Card generation prompt template** — the system prompt used for cards-mode runs
- **Temperature** — sampling temperature sent with both chat and cards runs
- **Built-in defaults** — the product's default prompt texts and temperature when the user has not saved a custom value
- **Compiled prompt** — the template after variables are expanded for the current deck template and provider

Relationships:

- Saved settings are global; every conversation reads the same values.
- Profile, model, and model parameters stay per conversation; see the conversations spec.
- Prompt templates are compiled when a run starts and when the settings preview is shown.
- Card generation behavior after the prompt is sent is covered by the card-generation spec.

## Prompt Templates

There are two independent templates:

- **Chat prompt** — used when the conversation is in chat mode
- **Card generation prompt** — used when the conversation is in cards mode

Each template starts from a built-in default until the user customizes it.
The editor shows the effective text: the saved custom text, or the built-in default when none is saved.

The user can edit either template as free text.
Reset fills that editor with the built-in default text for that template.
Preview and edit toggle for each template independently.
Preview is read-only.

Saving persists both templates and temperature together.
Discard restores the last saved values.

An empty custom template is allowed and is sent as compiled empty content after trimming.
Invalid temperature is rejected on save; the previous saved settings remain unchanged.

## Variables

Templates may include these placeholders:

- `{{fields}}` — expands to the active deck template's fields (id, title, type, required or optional)
- `{{rules}}` — expands to card-structure and content rules
- `{{provider}}` — expands to provider-specific format instructions when the provider needs them

Variables are optional.
The user can include none, some, or all of them.
Unrecognized text is left as written; only these three placeholders are replaced.

Expansion differs by which template is being compiled:

- Card generation uses the generation rules wording.
- Chat uses the assistant rules wording.

`{{provider}}` expands to nothing when there is no provider or when the provider does not need extra format instructions.
Otherwise it expands to that provider's format guidance for the compilation mode.

The built-in card generation default includes all three variables.
The built-in chat default is plain text with no variables.

## Preview

Preview shows the compiled prompt for the current editor text.
It uses:

- the active conversation's deck template fields, when a deck and template are available
- the currently selected profile's provider
- the matching compilation mode for that prompt (chat or card generation)

If no deck is selected, or the deck's template has no fields yet, `{{fields}}` expands to an empty field list.
Changing the deck, provider, or editor text updates the preview without saving.

Preview does not send a request to the model.

## Temperature

Temperature is a single slider from 0 through 2 in steps of 0.1.
The built-in default is 0.2.

The same saved temperature is used for both chat and cards runs.
Values outside 0–2 cannot be saved.

## How Settings Apply to Runs

A run uses the settings that are current when the run starts.
Changing settings does not rewrite past messages or past runs.

If the user has not saved a custom prompt for a mode, that run uses the built-in default for that mode.
If a custom prompt is saved, that text is compiled and used instead.

Temperature omitted or unset falls back to 0.2 for the run.

## Edge Cases

- Assistant settings are shared across all conversations; editing them in one place affects later runs everywhere
- Prompt-editor open/closed mode (edit vs preview) is local to the form session and is not persisted
- Settings-panel open state is local to the assistant view and is not persisted
- Saving does not start a run and does not change the active conversation's messages
- Profile secrets and model parameters are not part of assistant settings
- When the active deck's template later changes, later previews and runs expand `{{fields}}` and `{{rules}}` against the new template
