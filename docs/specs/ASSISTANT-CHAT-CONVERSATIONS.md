# Assistant Chat: Conversations

Covers the conversation lifecycle, messages, runs, mode switching, deck selection and locking, AI profile state, persistence, restore, error handling, and retry.
Does not cover deck management, AI provider configuration, or the streaming transport layer.

## What is a Conversation

A conversation is a single threaded interaction between the user and the AI.
Each conversation has a name, a timestamp, and a history of messages and AI runs.

A conversation starts empty.
It has no messages, no runs, no deck selected, and is in chat mode.
It becomes active when the user sends their first message.

## Conversation List

Conversations are listed in the sidebar, sorted by most recently updated.
The timestamp is bumped only when a new run starts — that is, when the user sends a message or retries the most recent run.

## Messages

Every user message is paired with an assistant message.
The user types a prompt, the AI responds — that's one exchange, tied to a single run.

Messages are displayed as a scrollable list.
User messages appear as bubbles.
Assistant messages render their content: plain text for chat responses, a table of generated cards for card generation runs.

### Conversation History

When sending a new message, the full conversation history is sent to the AI provider.
The rule is simple: what the user sees in the conversation is what the model gets.
This includes:

- All user messages (if they have text content)
- All assistant chat responses (if they have text content), including partial responses from failed or canceled runs
- All successfully generated card outputs (serialized as markdown blocks)

Failed or canceled card generation outputs are not included in the history.
Card outputs are not displayed in the conversation, so they are also not included in the history.
Messages that don't belong to any run are also excluded.

### Conversation Name

The conversation is named after the first user message, truncated to 48 characters.
If the message is longer, it's trimmed with an ellipsis.
If there are no user messages yet, the name defaults to "Untitled".

## Runs

A run represents a single AI request.
It can be either a chat completion or a card generation.
Each run goes through a lifecycle:

**streaming** → **success** | **failed** | **canceled**

### Starting a Run

When the user sends a message, a run starts immediately:

1. The user message is added to the conversation
2. A run is created in streaming status
3. An empty assistant message placeholder is added
4. The AI stream begins

### During Streaming

For chat runs, text chunks arrive and accumulate on the assistant message in real time.
The user sees the response being built word by word.

For card generation runs, individual cards arrive one at a time.
Each card starts in an idle state and can be independently marked as added to a deck, pending, or errored.

### Completion

When the stream finishes successfully, the run is marked as success.
Token usage is recorded.
For card generation runs, the mode automatically switches back to chat.

### Failure

If the stream encounters an error (network issue, API error, etc.), the run is marked as failed with an error message.
The partial content accumulated before the failure is preserved.
The user can see what was generated up to that point.

### Cancellation

The user can cancel an active run at any time.
For chat runs, the text accumulated so far is kept — the message shows the partial response.
For card generation runs, cards received before cancellation are kept.

## Mode Switching

The assistant operates in two modes: **chat** and **cards**.

- **Chat mode**: the AI responds with free-form text
- **Cards mode**: the AI generates structured flashcards

The user can toggle between modes using a keyboard shortcut, but only when a deck is selected.
If no deck is selected, the app stays in chat mode regardless of the toggle.

After a card generation run completes successfully, the mode automatically switches back to chat.
If the run fails or is canceled, the mode stays as cards.

## Deck Selection and Locking

Each conversation has a selected deck.
The deck determines where generated cards can be added.

Once a conversation contains successfully generated cards, it becomes **locked** — the deck cannot be changed.
This prevents mixing cards from different decks in the same conversation.

If card generation fails or is canceled, the conversation stays unlocked — the deck can still be changed.

## AI Profile State

Each conversation stores its own AI profile state so switching between conversations restores the right setup.

- **AI profile** — which provider credentials to use.
- **Model** — which model within the chosen profile.
- **Model parameters** — values for supported parameters, for example reasoning effort.

All three are persisted on the conversation.

If the user picks a different profile, the model and parameters are reset to that profile's defaults.
If the user picks a different model, the parameters are reset to that model's defaults.

### Global AI Profile State

In addition to the per-conversation values, the app tracks a single **global AI profile state** shared across all conversations.
The global record holds the same three fields: profile, model, and model parameters.
The global record is persisted across sessions.

The global AI profile state is used to initialize a new conversation's own AI profile state.
When the user starts a new conversation, its profile, model, and model parameters are pre-filled from the global record.
From that point on, the conversation's own values take over and can diverge from the global one.

**Loading** — on app load, the global record is read from storage.
If no value is stored yet, the global is reconciled to defaults: the first available profile, that profile's default model, and default parameters.
If a stored value is present but its profile is no longer available, the global is reconciled to defaults the same way.
If a stored value is present and its profile is available, it is used as-is.

**When it is updated** — the global record is updated in two cases:

1. When the user starts a run by submitting a prompt in any conversation.
2. When the user changes any of the three AI profile state values (profile, model, or model parameters) in any conversation.

## Persistence

Conversations are saved to the database automatically.
The entire conversation state — messages, runs, mode, deck, and AI profile state — is saved as a single document.

### When Saves Happen

- **During streaming**: saves are throttled to at most once per second
- **While idle**: saves are debounced at 250ms after the last change
- **On page unload**: any pending save is flushed immediately

### What Gets Saved

Everything is saved as-is, including failed runs and their error messages.
There is no filtering before save.

### What Doesn't Get Saved

Empty conversations — with no messages and no active run — are never persisted.
They exist only in memory until the user sends a message.

### Active Conversation

The ID of the currently active conversation is stored in browser local storage separately from the conversation state.
This allows the app to reopen the same conversation on reload.

## Restore and Normalization

When a conversation is loaded from the database, it goes through validation and cleanup:

- **Streaming runs are removed**: if the app crashed or closed mid-stream, any run that was still streaming is discarded along with its messages
- **Failed runs are replaced with an error marker**: the run record itself is discarded, but the user message and the assistant message stay
  The assistant message is rewritten to an error marker that preserves the run's mode, so the user can see what they tried, that the AI failed to answer, and can retry.
  The conversation is never left empty as a result of a failed run.
- **Pending card statuses are reset**: cards that were mid-operation are reset to idle
- **Active run is cleared**: no run is considered active after restore
- **Dismissed error is cleared**: any previously dismissed error banner resets

This ensures a clean state on restore — no orphaned messages, no zombie streaming states.

If the stored data is corrupted or invalid, the conversation is reset to a fresh empty state with the same ID and current timestamp.

## Error Handling

Errors are displayed in an error panel at the bottom of the chat.

### Error State

Each conversation tracks its own errors.
The error panel shows the most recent error for the current conversation.

Dismissed errors stay hidden until a new error occurs — then the panel reappears with the new error.

The error state does **not** persist across sessions.
On page reload all errors are cleared and the error panel is hidden.

### Stream Errors

When a stream fails mid-way, the error is displayed in the error panel.
The partial content generated before the failure remains visible.

### Save Errors

If saving to the database fails, a dismissible save error panel appears.
If the user switches to a different conversation before the save error is displayed, the error is silently discarded.
It belongs to the old conversation.

### Dismissing Errors

Stream errors can be dismissed by the user through the error panel button.
A dismissed error stays hidden until a new failure occurs, at which point the panel reappears with the new error.
Reloading the page also clears the error.

Save errors are dismissed separately and are cleared by a successful save.

## Retry

The user can retry a failed or completed run.
Retry re-executes the same request with the same parameters.

- The run ID is reused — the existing message pair is overwritten
- For chat retries, the previous response text is cleared and replaced with the new stream
- For card generation retries, previous cards are cleared and new cards stream in from scratch
- The conversation history sent to the AI is rebuilt from the current state, including all previously successful runs

Retry is only available on the most recent message pair.
You cannot retry an older run.

Retry preserves the original mode — a chat run retries as chat, a card generation run retries as cards.

## Concurrent Behavior

Only one run can be active at a time per conversation.
If the user switches to a different conversation while a run is active, the run continues in the background.
Its dispatches target the old conversation's state and have no effect.
When the old conversation is later restored, the streaming run and its messages are removed by normalization.

## Edge Cases

- A conversation with no user messages is named "Untitled" and never persisted to the database
- A failed run from a previous session leaves the user message and an error assistant message behind on restore, so the conversation is never persisted as empty
- The "New Conversation" button is disabled when there are no messages and no active run — you can't create a second empty conversation
- If the sidebar has no conversations, nothing is shown (not even an empty state message)
- Card statuses are always idle when first generated — they only become pending or success through user interaction
- The deck picker hotkeys are disabled when the conversation is locked
- Mode toggle is disabled when no deck is selected
- Picking a different AI profile, model, or model parameter does not change the conversation's order in the sidebar
- Picking a different AI profile, model, or model parameter in one conversation does not immediately change what other conversations show
  The global last-used record is updated when the user changes the value or submits a prompt
- When a conversation is loaded and its data is invalid, it's silently reset to empty rather than showing an error
