# Assistant Conversations

Covers the conversation lifecycle, messages, runs, AI profile state, persistence, restore, error handling, retry, and revert.
Does not cover deck management, AI provider configuration, assistant settings (prompt templates and temperature), or the streaming transport layer.
Those prompt and temperature preferences are covered by the assistant settings spec.
Card proposal display, selection, and add are covered by the card-generation spec.
How the model reads decks is covered by the data-access spec.

## What is a Conversation

A conversation is a single threaded interaction between the user and the AI.
Each conversation has a name, a timestamp, a history of messages and AI runs, and its own unsent prompt.

A conversation starts empty.
It has no messages and no runs.
The prompt input belongs to that conversation and is independent of every other conversation.
Updating the prompt does not make the conversation active and does not change its timestamp.
It becomes active when the user sends their first message.
Every new run is chat.
The model may propose cards during that run.

## Core Model

- **Conversation** — one thread with a name, a timestamp, its messages, runs, AI profile state, and unsent prompt
- **Message** — one half of an exchange; every user message is paired with an assistant message
- **Run** — one AI request with a lifecycle: streaming, then success, failed, canceled, or interrupted
- **AI profile state** — the profile, model, and model parameters; stored per conversation and once globally
- **Write target** — the deck and template an accepted proposal targeted; kept per run
- **Prompt input** — the unsent composer text for this conversation
- **Revert state** — in-memory only; hides messages from a past user message onward

Relationships:

- A user message, its assistant message, and their run form one turn.
- Only one run can be active per conversation at a time.
- Empty conversations are never saved.
- Revert filters what the UI and the next request see; deletion happens only on the next submit.
  See ASSISTANT-MESSAGES.md (§Reverting the Conversation).
- Write targets belong to runs, not conversations; see ASSISTANT-CARD-GENERATION.md (§How Cards Are Proposed).
- What the model sees of decks is through tools; see ASSISTANT-DATA-ACCESS.md.

## Conversation List

Conversations are listed in the sidebar, sorted by most recently updated.
The timestamp is bumped only when a new run starts — that is, when the user sends a message or retries the most recent run.
Picking a different AI profile, model, or model parameter does not change the conversation's order in the sidebar.
Typing in the prompt input does not change the conversation's order in the sidebar.
If the sidebar has no conversations, nothing is shown.
The "New Conversation" button is disabled when there are no messages and no active run.
A second empty conversation cannot be created.
Each row shows a relative age next to the conversation's name, taken from the conversation timestamp.
A working or unread indicator may appear next to the conversation's name.

### Working Status

A conversation is **working** when it has an active run that is still streaming.
The working status indicator takes priority over the unread status indicator.
The indicator is shown when the latest run is streaming.
The working indicator is cleared when the run completes, fails, is canceled, or is interrupted.

### Unread Status

A conversation is **unread** when its most recent run has finished and the user has not yet opened it since the run finished.
A finished run is one whose status is success, failed, canceled, or interrupted — never streaming.
The indicator is shown when the latest run finished streaming and has not been read by the user.
The unread indicator is cleared when the user opens the conversation.

A run that finishes in the currently-open conversation is automatically marked as read — the user has just watched it stream, so it cannot be unread.

## Messages

Every user message is paired with an assistant message.
The user types a prompt, the AI responds — that's one exchange, tied to a single run.
How a turn displays is covered by the messages spec.

### Conversation History

When sending a new message, the full conversation history is sent to the AI provider.
The rule is simple: what the user sees in the conversation is what the model gets.
This includes:

- All user messages (if they have text content)
- All assistant text (if they have text content), including partial text from failed or canceled runs
- All successfully generated card outputs (serialized as markdown blocks)

A chat response that proposed cards is sent as those serialized cards, then any leftover assistant text from that run.
Failed or canceled card outputs are not included in the history, even when the table stayed on screen.
See ASSISTANT-CARD-GENERATION.md (§Conversation History) for the markdown serialization.
Tool activity is not included in the history.
See ASSISTANT-DATA-ACCESS.md (§Visibility).
If the model needs current data again, it calls tools again.
Messages that don't belong to any run are also excluded.

### Conversation Name

The conversation is named after the first user message, truncated to 255 characters.
If the message is longer, it's trimmed with an ellipsis.
If there are no user messages yet, the name defaults to "Untitled".

## Runs

A run represents a single AI request.
Every new run is a chat request.
The model may call tools and propose cards during that run.
Each run goes through a lifecycle:

**streaming** → **success** | **failed** | **canceled** (`reason: user`) | **interrupted** (`reason: app_shutdown` | `crash_recovery`)

Only explicit user intent produces `canceled`.
Graceful app shutdown produces `interrupted` / `app_shutdown`.
A process crash (or forced termination) that left a streaming checkpoint produces `interrupted` / `crash_recovery` on restore.
Success, failure, and streaming must not carry a termination reason.

### Starting a Run

When the user sends a message, a run starts immediately:

1. The user message is added to the conversation
2. A run is created in streaming status
3. An empty assistant message placeholder is added
4. The AI stream begins

### During Streaming

Text chunks arrive and accumulate on the assistant message in real time.
The user sees the response being built word by word.
Tool activity and accepted cards appear on the same message; see ASSISTANT-CARD-GENERATION.md (§Card Display).

### Completion

When the stream finishes successfully, the run is marked as success.

### Failure

If the stream encounters an error (network issue, API error, etc.), the run is marked as failed with an error message.
The partial content accumulated before the failure is preserved.
The user can see what was generated up to that point.

### Cancellation

The user can cancel an active run at any time.
The text accumulated so far is kept — the message shows the partial response.
Accepted cards stay visible; see ASSISTANT-CARD-GENERATION.md (§Card Display).
Cancellation is recorded as `canceled` with `reason: user`.

### Interruption

A run can also end as `interrupted` without user cancel intent:

- **app_shutdown** — graceful app close transitions active streaming runs before the final flush.
- **crash_recovery** — a persisted streaming checkpoint found on restore means the previous process died mid-run.

Partial chat text and cards received before the interruption remain visible and eligible for retry.

## Write Targets

Conversations do not have a selected deck.
Each run keeps its own write target, so later turns may propose for a different deck.
Add uses that write target.

How a proposal sets the write target, including an accepted list of 0 cards, is in ASSISTANT-CARD-GENERATION.md (§How Cards Are Proposed).
Field titles reach the model through tools, not the system prompt; see ASSISTANT-DATA-ACCESS.md.

## AI Profile State

Each conversation stores its own AI profile state so switching between conversations restores the right setup.

- **AI profile** — which provider credentials to use.
- **Model** — which model within the chosen profile.
- **Model parameters** — values for supported parameters, for example reasoning effort.

All three are persisted on the conversation.

The model picker selects a profile and model together.
Changing the selection sets both.
If the model changes, model parameters are reset to that model's defaults.
When the user has no AI profiles, the picker still opens and shows an add-profile button.

### Global AI Profile State

In addition to the per-conversation values, the app tracks a single **global AI profile state** shared across all conversations.
The global record holds the same three fields: profile, model, and model parameters.
The global record is persisted across sessions.

The global AI profile state is used to initialize a new conversation's own AI profile state.
When the user starts a new conversation, its profile, model, and model parameters are pre-filled from the global record.
From that point on, the conversation's own values take over and can diverge from the global one.

**Loading** — on app load, the global record is read from storage.
If no value is stored yet, the global is reconciled to defaults: the newest available profile, no model, and empty parameters.
If a stored value is present but its profile is no longer available, the global is reconciled to defaults the same way.
If a stored value is present and its profile is available, it is used as-is.
When a model is missing or no longer in the provider's list, the first available model for that profile is used once the list loads.

**Empty chat with no profiles** — when the conversation has no messages and the user has no AI profiles,
the messages area shows an empty state with a short message and an add-profile button.
The model picker in the footer still opens and shows the same add-profile action in its empty popover.
The button opens the same add-profile dialog as AI settings.
Once a profile exists, these empty states are no longer shown.

**When it is updated** — the global record is updated in two cases:

1. When the user starts a run by submitting a prompt in any conversation.
2. When the user changes any of the three AI profile state values (profile, model, or model parameters) in any conversation.

## Persistence

Conversations are saved automatically.
Messages, runs, and AI profile state are saved together.
Unknown future formats fail restore rather than loading.
The revert state is not saved.

### When Saves Happen

- **During streaming**: at most once per second
- **While idle**: shortly after the last change
- **On app close**: any pending save is flushed immediately

### What Gets Saved

Everything is saved as-is, including failed runs and their error messages.

### What Doesn't Get Saved

Empty conversations — with no messages and no active run — are never persisted.
They exist only in memory until the user sends a message.
Composer text on an empty conversation does not make it persistable.
Typing in the prompt does not schedule a save and does not bump the conversation timestamp.
When a conversation is saved for another reason, the current composer text is stored with it.

### Active Conversation

The currently open conversation is remembered so the app can reopen it on reload.

## Restore

When a conversation is loaded:

- A run that was still streaming becomes interrupted (crash recovery).
  Partial output is kept so the user can retry.
- Failed, canceled, and interrupted runs are kept, including partial chat text and cards.
- Pending card statuses are reset; see ASSISTANT-CARD-GENERATION.md (§Card Status).
- Accepted cards on a turn still show as a review table.
- No run is active after restore.
- Dismissed errors and revert state are cleared.

If the stored data is corrupted or from an unknown future format, the conversation resets to empty with the same identity and a current timestamp.

## Error Handling

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

The user can retry a failed, canceled, or interrupted run.
Successful runs are not retryable.
Retry re-executes the same prompt as a chat request with tools.

- The run ID is reused — the existing message pair is overwritten
- Previous response text, cards, and tool rows are cleared and replaced with the new stream
- The conversation history sent to the AI is rebuilt from the current state, including all previously successful runs

Retry is only available on the most recent message pair.
You cannot retry an older run.
How a mixed turn looks after retry is in ASSISTANT-MESSAGES.md (§Retrying a Run).
How cards and tools are cleared is in ASSISTANT-CARD-GENERATION.md (§Retry).
How retry fetches data is in ASSISTANT-DATA-ACCESS.md (§Retry).

### AI Profile State on Retry

Retry uses the conversation's **current** AI profile state — profile, model, and model parameters — not the values that were in effect when the original request was made.
This lets the user fix a failed run by switching profile, model, or parameters and then retrying, without having to send a new message.

If the user has not changed anything, retry behaves the same as the original request.

## Clone

The user can clone an existing conversation to create an independent copy.

### What Gets Cloned

The following are copied into the new conversation:

- All messages (user and assistant)
- All completed runs (success, failed, canceled, or interrupted) — streaming runs are not cloned
- AI profile state (profile, model, model parameters)
- Conversation name

### What Does Not Get Cloned

- The conversation ID — the clone gets a new ID
- Unread status — the clone starts as read
- Active streaming state — any in-progress run is not copied
- Prompt input — the clone starts with an empty composer

### Clone Trigger

Cloning is triggered from the conversation menu.
The clone appears immediately in the sidebar, sorted by its new timestamp.
The user is navigated to the cloned conversation.

## Delete

The user can delete a conversation from the sidebar.
Delete asks for confirmation and cannot be undone.

### What Deletion Does

Confirming permanently removes the conversation, its messages, and its runs.
The row disappears from the sidebar.

A run that is still streaming in the deleted conversation is canceled as part of deletion.
A late save cannot bring the conversation back; see Concurrent Behavior.

### Deleting the Open Conversation

If the deleted conversation is the one currently open, the app starts a fresh empty conversation in its place.
The new conversation's AI profile state is pre-filled from the global record, like any new conversation.
The user is navigated to it immediately.

### Failed Deletion

If deleting fails, the confirmation popover shows the error in place of its message.
The confirm button stays disabled until the popover is reopened, which resets the error.
The conversation itself is unchanged.

## Revert

Full behavior is specified in ASSISTANT-MESSAGES.md (§Reverting the Conversation).
This section covers only conversation-level effects.

### Revert State

Revert does not persist across sessions.
Reloading the app clears the revert state.

### Conversation-Level Implications

- The conversation history sent to the next run is filtered by the revert state — hidden messages are not included.
- Run write targets and deck contents are not affected by revert.
- A conversation that looks empty because of revert is still saved, since the messages are still in the conversation state.

### Deletion on New Prompt

See ASSISTANT-MESSAGES.md (§Re-trigger) for how submit deletes the hidden turns.
If that deletion leaves no messages, the conversation is not saved.
Runs that remain keep their write targets.

### Cloning a Reverted Conversation

Cloning a conversation in a reverted state produces a clone without the revert state.
The clone is created from the underlying conversation data with all messages visible.

## Concurrent Behavior

Only one run can be active at a time per conversation.
If the user switches away, the run continues in the background.
Updates still apply to the conversation that started the run, not the one now on screen.
Deleting a conversation cancels its in-flight work.
A late save cannot bring it back.
