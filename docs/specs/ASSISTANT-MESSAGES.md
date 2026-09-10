# Assistant Messages

Covers message types, message metadata, how messages are displayed, message states and status indicators, and user interactions with messages.
Does not cover conversation lifecycle, runs, persistence, or the streaming transport layer.
Card selection and add are covered by the card-generation spec.

## What are Messages

A message is one half of a user-AI exchange.
Every user message is paired with an assistant message.
Together they form a single turn in the conversation, tied to one AI run.

## Core Model

- **User message** — the submitted prompt text
- **Assistant message** — the AI's response; created empty at run start and filled by the stream
- **Turn** — one user message and its assistant message, tied to a single run
- **Metadata kind** — chat-text or error; decides how an assistant message renders
- **Revert point** — the user message a revert targets; in-memory, at most one per conversation

Relationships:

- An assistant message inherits its state from its run.
- A message pair maps to exactly one run; retry overwrites that pair in place.
  See ASSISTANT-CONVERSATIONS.md (§Retry).
- The metadata kind picks the display; an error marker has empty text and shows a retry button.
- A turn that proposed cards renders as tool activity, the review table, then leftover text.
  See ASSISTANT-CARD-GENERATION.md (§Card Display).
- Revert hides the target turn and everything after it; the data is removed only by the next submit.

## Message Types

There are two types of messages: user messages and assistant messages.

User messages contain the text the user typed.
A user message is created when the user submits a prompt.

Assistant messages contain the AI's response.
An assistant message is created as an empty placeholder when a run starts.
Its content fills in as the AI stream progresses.

## Message Metadata

Each assistant message carries metadata that classifies its kind.

There are two kinds:

- **chat-text** — a chat response from the AI.
  The same turn may also show tool activity and a review table when that run proposed cards.
- **error** — a synthesized error marker.
  Created when a run fails or when restoring a failed run from the database.
  The message text is cleared to empty.

The metadata kind determines how the message is rendered.

## Message Display

Messages are rendered differently based on their type and metadata.

User messages always render as text.

Assistant messages:

- **chat-text**: the streamed text is shown as rendered markdown.
  Reasoning and tool calls appear as activity rows above that text, even when there are no cards.
  See §Message Content.
  A status indicator shows the run state.
  When the same run proposed cards, that turn is mixed:
  tool activity, then the review table, then leftover streamed text, then status.
  Leftover text appears below the table, not above it.
  Once cards are on screen, the pending status is not shown on the table; it attaches below the table until text arrives.
  Tool activity, if any, appears above the table even when there is no leftover text.
- **error**: a failed status indicator and a retry button are shown.

Status indicators appear below assistant messages.
They show one of:

- pending
- success
- canceled
- interrupted
- failed

## Message States

An assistant message inherits its state from the run it belongs to.
See ASSISTANT-CONVERSATIONS.md (§Runs) for the run lifecycle.

The message state maps to the run state:

- **pending/streaming**: text is empty or partial.
  A pending shimmer indicator is shown unless cards or leftover text already occupy the turn.
- **success**: full content is displayed.
  An elapsed time indicator is shown.
- **failed**: partial content is preserved.
  A failed status indicator with a retry button is shown.
- **canceled**: partial content is preserved.
  A canceled status indicator is shown.
- **interrupted**: partial content is preserved.
  An interrupted status indicator with a retry button is shown.
  Elapsed time is included when a duration was saved; crash restore does not count downtime. See ASSISTANT-CONVERSATIONS.md (§Restore).

For a mixed chat turn, content is the tool rows, the proposed cards, and leftover text together.

## Interactions

### Sending a Message

The user types a prompt and presses Enter or clicks Submit.
This creates a user message and an assistant message placeholder.
A run starts immediately in streaming status; see ASSISTANT-CONVERSATIONS.md (§Starting a Run).
If that run fails, the user message and an error assistant message remain, so the conversation is not empty.

### Canceling a Run

The user can press a stop button or use a hotkey while a run is active.
See ASSISTANT-CONVERSATIONS.md (§Cancellation) for the run outcome.
The text accumulated so far is kept.

### Retrying a Run

See ASSISTANT-CONVERSATIONS.md (§Retry) for when retry is available, which run it reuses, and which AI profile state it uses.

Retry of an error marker rewrites it to a chat-text message so the new stream can render as a mixed turn.

### Reverting the Conversation

The user can revert the conversation to the state it was in before any past user message.
Revert is a visual action.
It hides the target user message and everything after it from the UI, while leaving the underlying data intact.
The hidden messages are only actually deleted when the user submits a new prompt.

The revert affordance is available next to every user message.
It is available regardless of the paired assistant's status: success, failed, canceled, or error marker.

#### What Is Hidden

After revert, the following are hidden from the UI:

- The target user message
- Its paired assistant message, including any error marker
- All subsequent user and assistant messages
- If a run is currently streaming, it is canceled first; its messages and partial content are hidden along with the rest

The hidden messages and runs remain in the conversation state.
They are filtered out of the UI but the data is not modified.
While revert is active, hidden messages are also excluded from the conversation history sent to the AI.

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
Any text the user had typed in the input before the revert is held in the revert state and replaced by the pre-fill.
The next submit is a chat run.

Sending the pre-filled prompt — edited or as-is — does two things in order:

1. Permanently removes the hidden messages and their runs from the conversation state.
2. Creates a new user message with the submitted text and starts a fresh run.

The fresh run uses a new run ID.
It is a new run, not a retry.
The conversation history sent to the AI is rebuilt from the now-shorter message list.

## Message Content

Assistant text is displayed as rendered markdown, including leftover text on a mixed turn.
User messages are displayed as paragraphs.
Reasoning is shown as an activity row on the same assistant message.
It sits in the same activity list as tool calls, in the order they arrived.
The reasoning text is displayed as rendered markdown, using the same sanitization as assistant text.
While the model is thinking, the row is labeled Thinking and the reasoning text is visible.
When thinking finishes, the row is labeled Thought and the text is collapsed.
A user toggle is kept if they already opened or closed it.
The user can expand or collapse the row.
A chevron after the label points right when collapsed and rotates down when expanded.
An elapsed time follows the label, separated by a dot, the same way the message status shows it.
It appears after one second. While the model is thinking the time ticks; when thinking finishes it freezes.
Sub-second thinking is omitted.
Consecutive reasoning stays on one row.
A new row starts after a tool call.
Empty reasoning is not shown.
Reasoning is not included in conversation history.
See ASSISTANT-CONVERSATIONS.md (§Conversation History).
Tool calls use the same expand and collapse control as reasoning; the disclosed payload is bordered. See ASSISTANT-DATA-ACCESS.md (§Visibility).
Other non-text parts are shown as metadata lines, except step-start parts, which are hidden.
Proposed cards stay in the review table; leftover markdown does not become cards.

When extracting text for display or history, all text parts are joined with double newlines.
Leading and trailing whitespace is trimmed.
