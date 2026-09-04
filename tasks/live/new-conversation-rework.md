# New conversation rework

Status: ready

## Intent

New conversation starts as the AI route with no conversation id.
The composer is empty.
No list row exists yet.

The first non-whitespace change to the prompt input assigns an id, navigates to that conversation, and persists it.
Whitespace-only edits do not mint an id.
Many such conversations can exist at once.
The conversation then appears in the sidebar.

Every conversation with an id is persisted, including ones that have never had a submitted turn.
Clearing the composer does not remove the conversation.
It stays until the user deletes it.

Those drafts differ from conversations that already have a submitted run:

- Delete does not ask for confirmation.
- The title in the conversations list is dimmer.
- The title follows the prompt: it updates as the prompt changes, and becomes Untitled if the prompt is wiped.

`updatedAt` is set when the conversation is created.
Later prompt and title edits do not bump it.
The next bump is when a run is submitted.

Reload or cold start on the AI route with no params restores the last active conversation, as today.
New conversation still navigates to the param-less route and must not be redirected away.
Deleting the open conversation also goes to the param-less route.

Done when a user can open New conversation, type, see the thread appear in the list at a real id with a live title, reload and still have that draft, and delete it in one click.

## Scope

In:

- Conversation creation, identity, and the AI route with no `conversationId`.
- Persistability of conversations that have an id, including those with no turns.
- Live title from prompt text until the first submitted run, in the list and the header.
- Sidebar listing, dimmer draft titles, and delete without confirmation for drafts.
- Spec updates in `docs/specs/ASSISTANT-CONVERSATIONS.md` for creation, list, name, persistence, and delete.
- The empty-conversation example in `agents/FUNCTIONAL-SPECIFICATIONS.md` if that persistence rule changes.
- Tests that encode the current “empty is never saved / never listed / no second empty” rules.

Out:

- Run lifecycle, retry, revert, clone contents, card generation, and save-queue infrastructure.
- Changing how titles are derived after the first submitted run (still the first user message).
- Visual design beyond the dimmer draft title in the list.

## Open questions

- [x] What counts as the prompt change that mints an id? — any edit except whitespace-only
- [x] If the user then clears the composer? — the conversation stays until the user deletes it
- [x] Many untitled drafts, or a unique “new” surface? — many drafts are allowed
- [x] After deleting the open conversation? — go to the param-less AI route
- [x] Reload or cold start on the AI route with no params? — restore the last active id, as today
- [x] `updatedAt` for drafts? — bumped on create, then not again until a run is submitted
- [x] Title before the first submitted run? — follows the prompt; wiped prompt becomes Untitled

## Plan

- [x] 1. Assign conversation identity on the first non-whitespace prompt
  Goal: Stop minting an id when the AI route loads.
  New conversation navigates to the AI route with no `conversationId` and clears the stored active id so the cold-start restore does not bounce the user back.
  Reload or a cold visit to the param-less route still restores the last stored active id, as today.
  Deleting the open conversation also goes to the param-less route and does not mint a replacement.
  The New conversation control is disabled only while already on that param-less surface.
  It is enabled when viewing any existing conversation, including a draft with no runs.
  The first prompt edit whose trimmed value is non-empty assigns an id, inserts the conversation with `updatedAt` equal to `createdAt`, copies the global AI profile into it, writes the prompt, and navigates to that id.
  Whitespace-only edits do not mint.
  The param-less composer may hold whitespace locally until that first non-empty change.
  Profile and model changes on the param-less surface update the global record and are copied at mint time; they must not no-op.
  `ensureConversationId` on submit stays as a safety net if a send races ahead of mint.
  Session reset uses the same param-less path as New conversation.
  Update `docs/specs/ASSISTANT-CONVERSATIONS.md` for creation, the list New-conversation rule, and delete-of-open.
  Keep the persistence skip for conversations with no messages and no active run — drafts are still in-memory only after this item.
  Update e2e helpers in both suites so opening `/ai` no longer requires an immediate `conversationId`, and so New conversation expects the param-less URL.
  Constraints: Do not change the write adapter persistability gate, list chrome, or delete confirmation.
  Do not persist wiped drafts yet.
  Do not interpret conversation `state` in Rust.
  Read `docs/specs/ASSISTANT-CONVERSATIONS.md`, `agents/ASSISTANT-MAP.md`, `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/TESTING.md`.
  Done when: unit tests for mint-on-prompt, whitespace-only, New/delete navigation, and `updatedAt` on create pass.
  `bunx nx test srs-react` / the affected projects pass.
  Demo and electron e2e helpers no longer assume an id appears before the user types.
  Commit: Assign conversation ids when the prompt first has text
  Depends on: none

- [ ] 2. Persist drafts and live-update their titles from the prompt
  Goal: Once a conversation has an id, save it, including when it has no messages and no active run.
  Clearing the composer does not delete the row.
  `setPromptInput` schedules a save and does not stamp `updatedAt`.
  The next `updatedAt` bump remains a submitted run.
  `computeConversationTitle` uses the prompt when there is no user message, with the same trim, whitespace collapse, and 255-character truncation as today.
  A wiped or whitespace-only prompt stores a null title (Untitled in the UI).
  After the first user message, the title stays the first user message.
  The sidebar list and the header pick up title changes from the existing save-host list cache.
  Update `docs/specs/ASSISTANT-CONVERSATIONS.md` §Persistence and §Conversation Name, and the empty-conversation example in `agents/FUNCTIONAL-SPECIFICATIONS.md`.
  Constraints: Do not add draft chrome (dimmer row, skip confirm).
  Do not bump schema version.
  Do not change run-start timestamp rules.
  Read the same guides as item 1, plus `agents/ASSISTANT-MAP.md` persistence row.
  Done when: write-adapter, title-helper, restore, and store tests cover persist-on-id, live title, wiped Untitled, and no `updatedAt` bump on later prompt edits.
  Affected unit/integration tests pass.
  Commit: Persist conversations as soon as they have an id
  Depends on: 1

- [ ] 3. Dim draft titles and skip delete confirmation
  Goal: A conversation with no submitted run is a draft in the sidebar.
  Its title is dimmer than a conversation that has a turn.
  Delete does not ask for confirmation.
  After reload the list must still know which rows are drafts, so add a `hasTurns` flag to `ConversationListItem`.
  Compute it in the pgsql list query from stored messages.
  Map it in the Electron query function from the row's `state` in TypeScript — do not interpret `state` in Rust.
  Keep clone disabled when there are no turns, as today.
  Update `docs/specs/ASSISTANT-CONVERSATIONS.md` §Conversation List and §Delete.
  Constraints: No new database column or migration.
  Visual change is the dimmer list title only.
  Do not change header title treatment beyond what the list title already drives.
  Read `agents/ASSISTANT-MAP.md`, `agents/CSS.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/TESTING.md`, `agents/FUNCTIONAL-SPECIFICATIONS.md`.
  Done when: list and delete tests cover dim vs normal, skip-confirm on drafts, confirm still required after a turn, and `hasTurns` on list reads in pgsql (and Electron mapping tests if present).
  Affected tests pass.
  Commit: Treat unsent conversations as drafts in the sidebar
  Depends on: 2

- [ ] 4. Cover the draft conversation lifecycle in e2e
  Goal: In both `apps/demo-e2e` and `apps/native-electron-e2e`, a user can open New conversation (param-less URL), type, see the id in the URL and a live title in the list, wipe the prompt and see Untitled, delete that draft without a confirmation dialog, and still confirm when deleting a conversation that has a turn.
  Reload of the param-less route restores the last active conversation when one is stored.
  Many drafts can exist.
  Constraints: Mirror the two e2e suites.
  Do not add unit tests that shadow these flows.
  Done when: the new flows pass in both suites and existing conversation e2e still pass.
  Commit: Cover draft conversation lifecycle in e2e tests
  Depends on: 3

## Outcome
