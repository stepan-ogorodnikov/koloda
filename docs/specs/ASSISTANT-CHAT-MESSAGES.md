# Assistant Chat: Messages

Covers message types, message metadata, how messages are displayed, message states and status indicators, and user interactions with messages.
Does not cover conversation lifecycle, runs, card generation, persistence, or the streaming transport layer.

## What are Messages

A message is one half of a user-AI exchange.
Every user message is paired with an assistant message.
Together they form a single turn in the conversation, tied to one AI run.

Messages are displayed as a scrollable list.
The user scrolls through the history of exchanges.
New messages appear at the bottom.

## Message Types

There are two types of messages: user messages and assistant messages.

User messages contain the text the user typed.
They appear as rounded bubbles aligned to the right side of the chat.
A user message is created when the user submits a prompt.

Assistant messages contain the AI's response.
They appear aligned to the left side of the chat, spanning the full width.
An assistant message is created as an empty placeholder when a run starts.
Its content fills in as the AI stream progresses.

## Message Metadata

Each assistant message carries metadata that classifies its kind.

There are three kinds:

- **chat-text** — a free-form text response from the AI.
- **generated-cards** — a card generation response.
  The message itself holds minimal text.
  The actual card data lives in the generation run keyed by the run ID.
- **error** — a synthesized error marker.
  Created when a run fails or when restoring a failed run from the database.
  The message text is cleared to empty.
  The run's mode is preserved so the renderer knows how to display it.

The metadata kind determines how the message is rendered.

## Message Display

Messages are rendered differently based on their type and metadata.

User messages always render as text bubbles.

Assistant messages dispatch to different displays based on metadata:

- **chat-text**: the streamed text content is rendered inline.
  A status indicator shows the run state below the text.
- **generated-cards**: a table of generated cards is shown.
  The table has a selection column and one column per template field.
  While streaming, a pending shimmer is shown.
  On success, the table and elapsed time appear.
  On cancellation, cards received before cancel remain with a canceled status.
  On failure, partial cards remain with a failed status and a retry button.
- **error**: a status indicator showing failed state is displayed.
  A retry button is shown.
- **no metadata**: the message content is rendered as-is.

Status indicators appear below assistant messages.
They show one of: pending (animated shimmer), success, canceled, or failed.

## Message States

An assistant message inherits its state from the run it belongs to.

A run goes through these states:

**streaming** → **success** | **failed** | **canceled**

The message state maps to the run state:

- **pending/streaming**: text is empty or partial.
  A pending shimmer indicator is shown.
- **success**: full content is displayed.
  An elapsed time indicator is shown.
- **failed**: partial content is preserved.
  A failed status indicator with a retry button is shown.
- **canceled**: partial content is preserved.
  A canceled status indicator is shown.

For chat messages, content is the streamed text.
For card generation messages, content is the set of generated cards.

## Interactions

### Sending a Message

The user types a prompt and presses Enter or clicks Submit.
This creates a user message and an assistant message placeholder.
A run starts immediately in streaming status.

### Canceling a Run

The user can press a stop button or use a hotkey while a run is active.
For chat runs, the text accumulated so far is kept.
For card generation runs, cards received before cancellation are kept.
The run transitions to canceled status.

### Retrying a Run

The user can retry a failed or completed run.
Retry is only available on the most recent message pair.
An older run cannot be retried.

Retry reuses the same run ID.
The existing message content is cleared.
New content streams in from scratch.
The mode is preserved — a chat run retries as chat, a card generation run retries as cards.

### Reverting the Conversation

The user can revert the conversation to the state it was in before any past user message.
Revert is a visual action.
It hides the target user message and everything after it from the UI, while leaving the underlying data intact.
The hidden messages are only actually deleted when the user submits a new prompt.

The revert affordance is available next to every user message.

#### What Is Hidden

After revert, the following are hidden from the UI:

- The target user message
- Its paired assistant message, including any error marker
- All subsequent user and assistant messages
- If a run is currently streaming, it is canceled first; its messages and partial content are hidden along with the rest

The hidden messages and runs remain in the conversation state.
They are filtered out of the UI but the data is not modified.

#### Reverting Again

Reverting to a different user message while in a reverted state updates the revert point.
No messages are actually deleted by changing the revert point.
The pre-fill in the prompt input is updated to the new target message's text.

#### Restore

Restore is the inverse of revert.
It clears the revert state and makes all messages visible again.
The restore affordance is shown while the conversation is in a reverted state, near the prompt input.
Restore returns the prompt input to its pre-revert state, removing the pre-fill that revert applied.
Restore does not delete anything.

#### Re-trigger

After revert, the prompt input is pre-filled with the text of the reverted user message.
The mode is set to the mode that message was sent in.
Any text the user had typed in the input before the revert is held in the revert state and replaced by the pre-fill.

Sending the pre-filled prompt — edited or as-is — does two things in order:

1. Permanently removes the hidden messages and their runs from the conversation state.
2. Creates a new user message with the submitted text and starts a fresh run.

The fresh run uses a new run ID.
It is a new run, not a retry.
The conversation history sent to the AI is rebuilt from the now-shorter message list.

## Message Content

Message content is composed of typed parts.

Text parts are displayed as paragraphs.
Reasoning parts are displayed as dimmed text.
Tool call parts, source parts, and file parts are displayed as metadata lines.
Step-start parts are filtered out and not displayed.

When extracting text content for display or history, all text parts are joined with double newlines.
Leading and trailing whitespace is trimmed.
Non-text parts are ignored.

## Edge Cases

- An empty placeholder assistant message is created at run start, before any content arrives
- Partial content from a failed or canceled run is preserved and visible to the user
- Error marker messages have empty text but preserve the run's mode for correct rendering
- When restoring from database, streaming runs and their messages are removed entirely
- Failed runs leave behind the user message and an error assistant message, so the conversation is never empty
- Pending card statuses are reset to idle on restore, allowing the user to try adding them again
- If a template no longer exists when restoring, a synthetic template is created from stored field data so the card table can still render
- Only the most recent message pair can be retried — older runs are not retryable
- Retry metadata is rewritten from error back to its original kind so the renderer displays it correctly
- Messages without metadata are rendered as raw content without status indicators
- Revert is available on any user message regardless of its assistant's status — success, failed, canceled, or error marker. A streaming run is auto-canceled as part of the revert.
- The conversation history sent to the AI excludes hidden messages while revert is active.
