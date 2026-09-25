# Assistant Conversation List

## Scope

Covers creating a conversation, the conversation list, naming, working and unread indicators, clone, and delete.
Does not cover runs, conversation history, AI profile state, persistence, restore, or retry.
Those are covered by ASSISTANT-CONVERSATIONS.md.
Message display is covered by ASSISTANT-MESSAGES.md.
Card proposal display is covered by ASSISTANT-CARD-GENERATION.md.

## What it is

The list is the set of conversations the user can open, clone, and delete.
A conversation joins that set when it receives an identity.
Until then the AI route is an unsaved surface with no list row.

Naming, working, and unread are properties of a list row.
What a run does after it starts is a separate model.

## Core model

- **Identity** — the id that makes a conversation a saved list row
- **Draft** — a conversation that has never had a submitted run
- **Name** — the list label, taken from the first user message or from the unsent prompt before that
- **Working** — the latest run is still streaming
- **Unread** — the latest run has finished and the user has not opened the conversation since
- **Clone** — a new conversation copied from an existing one
- **Delete** — permanent removal of a conversation

Relationships:

- A list row exists only after an identity is assigned.
- Working takes priority over unread on the same row.
- A run that finishes in the open conversation is already read.
- Clone is a new identity.
- Delete cannot be undone.

## Creating a Conversation

A new conversation starts as the AI route with no conversation id.
The composer is empty.
No list row exists yet.
The first change to the prompt that is not only whitespace assigns an identity and creates the conversation.
Whitespace-only edits do not assign an identity.
The composer may hold whitespace until that first non-empty change.
Creating a conversation sets its timestamp to that moment.
Later prompt edits do not change the timestamp.
The next timestamp bump is when a run is submitted.
See ASSISTANT-CONVERSATIONS.md (§Starting a Run).

The prompt input belongs to that conversation and is independent of every other conversation.
Whether that surface is saved is covered by ASSISTANT-CONVERSATIONS.md (§What Doesn't Get Saved).

## Conversation List

Conversations are listed in the sidebar, sorted by most recently updated.
The timestamp is bumped only when a new run starts.
That is when the user sends a message or retries the most recent run.
See ASSISTANT-CONVERSATIONS.md (§Retry).
Picking a different AI profile, model, or model parameter does not change the conversation's order in the sidebar.
Typing in the prompt input does not change the conversation's order in the sidebar.
If the sidebar has no conversations, nothing is shown.
The "New Conversation" button and hotkey are disabled only when the open surface has no conversation id.
It is enabled when viewing any existing conversation, including one that has no messages and no active run.
Starting a new conversation goes to the AI route with no conversation id.
It forgets the last open conversation, so a reload of that route does not bounce back.
Session reset uses the same route.
A reload or cold visit to the AI route with no conversation id restores the last open conversation.
That happens only when one is remembered.
Each row shows a relative age next to the conversation's name, taken from the conversation timestamp.
A draft's name in the list is dimmer than the name of a conversation that already has a turn.
A working or unread indicator may appear next to the conversation's name.

### Working Status

A conversation is **working** when it has an active run that is still streaming.
The working status indicator takes priority over the unread status indicator.
The indicator is shown when the latest run is streaming.
The working indicator is cleared when the run completes, fails, is canceled, or is interrupted.
See ASSISTANT-CONVERSATIONS.md (§Runs).

### Unread Status

A conversation is **unread** when its most recent run has finished.
The user has not opened it since that run finished.
A finished run is one whose status is success, failed, canceled, or interrupted — never streaming.
The indicator is shown when the latest run finished streaming and has not been read by the user.
The unread indicator is cleared when the user opens the conversation.

A run that finishes in the currently-open conversation is automatically marked as read.
The user has just watched it stream, so it cannot be unread.

## Conversation Name

The conversation is named after the first user message, truncated to 255 characters.
If the message is longer, it's trimmed with an ellipsis.
If there are no user messages yet, the name follows the unsent prompt, using the same trimming.
If that prompt is empty or only whitespace, the name is Untitled.
After the first user message exists, later prompt edits do not change the name.

## Clone

The user can clone an existing conversation to create an independent copy.

### What Gets Cloned

The following are copied into the new conversation:

- All messages (user and assistant)
- All completed runs (success, failed, canceled, or interrupted) — streaming runs are not cloned
- AI profile state.
  See ASSISTANT-CONVERSATIONS.md (§AI Profile State).
- Conversation name

### What Does Not Get Cloned

- The conversation ID — the clone gets a new ID
- Unread status — the clone starts as read
- Active streaming state — any in-progress run is not copied
- Prompt input — the clone starts with an empty composer
- Dismissed stream errors — the clone shows the error panel if a copied run is still failed
  See ASSISTANT-CONVERSATIONS.md (§Dismissing Errors).

### Clone Trigger

Cloning is triggered from the conversation menu.
The clone appears immediately in the sidebar, sorted by its new timestamp.
The user is navigated to the cloned conversation.

### Cloning a Reverted Conversation

Cloning a conversation in a reverted state produces a clone without the revert state.
The clone is created from the underlying conversation data with all messages visible.
Revert itself is covered by ASSISTANT-MESSAGES.md (§Reverting the Conversation).

## Delete

The user can delete a conversation from the sidebar.
Delete cannot be undone.
A draft that has never had a submitted run is deleted immediately, without confirmation.
Delete still asks for confirmation after a run has been submitted.
The recovery screen for a conversation that failed to load also offers delete.
See ASSISTANT-CONVERSATIONS.md (§Restore).

### What Deletion Does

Deletion permanently removes the conversation, its messages, and its runs.
The row disappears from the sidebar.

A run that is still streaming in the deleted conversation is canceled as part of deletion.
A late save cannot bring the conversation back.

### Deleting the Open Conversation

If the deleted conversation is the one currently open, the app goes to the AI route with no conversation id.
It does not assign a replacement identity.
The composer is empty, and the global AI profile state applies, as for any new conversation.
See ASSISTANT-CONVERSATIONS.md (§Global AI Profile State).

### Failed Deletion

If deleting fails, the confirmation popover shows the error in place of its message.
The confirm button stays disabled until the popover is reopened, which resets the error.
The conversation itself is unchanged.
