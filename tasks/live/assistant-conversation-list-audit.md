# Assistant conversation list audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, agents/ASSISTANT-MAP.md, docs/specs/ASSISTANT-CONVERSATION-LIST.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/CSS.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, agents/REVIEW.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md
Flow: local

## Intent

Settle every finding of the assistant conversation list audit dated 2026-10-18.
It covered the behavior owned by `docs/specs/ASSISTANT-CONVERSATION-LIST.md`: creating a conversation, the sidebar
list and its order, naming, the working and unread indicators, clone, and delete.
The audited commit was `a78223ac`.
Its report was `tmp/audits/assistant-conversation-list.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.

The audit ran before the assistant conversations audit fixes (`26603f61..d32fb02e`) landed.
Triage checked each finding again at `d32fb02e`, where this task branches.
All 18 still hold; only line numbers moved.
Triage added two entries: 19 (a flaky list test seen during the earlier task) and 20 (host desync audit finding 7).

The report's verdict: delete and creation are in good shape.
The coordinated delete, the failed-delete popover, mint-on-prompt with its whitespace guard, and the reload bounce
match the spec and are covered on both hosts.
The weak part is how a row reports its state: each of the three list indicators reads from a source that goes stale.

Done when:

- a run that finishes while its conversation is not open shows unread after a retry, after an open mid-stream, and
  after a reload;
- sending a message in an older conversation moves it to the top of the sidebar;
- a conversation whose first run is streaming asks for confirmation before delete;
- going Back into a conversation deleted earlier lands on the AI route with no conversation id;
- New works when a conversation fails to load on a cold start;
- Clone is disabled while there is nothing finished to copy;
- screen readers announce the working and unread markers;
- the spec states each rule once and matches clone and the conversation menu;
- the header's draft-delete branch, the unused creation paths, the duplicate delete wiring, and per-row timers are gone;
- both e2e suites cover clone;
- `bun run check:push` passes on the tip.

## Scope

Findings 1–18 are numbered as in the report; 19 and 20 were added at triage.
Line numbers are at `d32fb02e`.
Paths without a package prefix are under `libs/assistant-react/src/lib/`.

- 1. Spec violation, Must-fix: unread compares run ids, so some finished runs never become unread.
  Decision: fixed by item 2.
  - The predicate skips a conversation when `latestRun.id === state.lastReadRunId`
    (`state/conversation-selectors.ts:81-93`).
    `markRead` records whatever run id it is given, streaming or not (`state/conversation-session.ts:55-59`).
  - Retry reuses the run id (`state/conversation-run-lifecycle.ts:22-53`) and leaves `lastReadRunId` alone.
    A run that failed in the open conversation was marked read when it failed.
    When its retry finishes in the background, the ids still match, so the row is not unread.
    `state/assistant-conversation-unread.test.ts:176-197` pins the unchanged `lastReadRunId` on restart.
  - Opening a conversation marks its latest run read even while it streams (`state/conversation-store.ts:166-185`).
    If the user opens it mid-stream and leaves before the run ends, the finished run is never unread.
  - The report's probe: retry in A, switch to B, finish A's run: A is not unread.
    Submit in A while on B, open A mid-stream, go back to B, finish: A is not unread.
  - Breaks §Unread Status: "unread when its most recent run has finished. The user has not opened it since that run
    finished."
- 2. Spec violation, Must-fix: unread indicators disappear after a reload.
  Decision: fixed by item 4, with entry 20.
  - `unreadConversationIdsAtom` iterates `conversationsAtom` only (`state/conversation-selectors.ts:81-105`).
  - Saved rows enter the store only when opened.
    Search: `grep -rn "upsertConversationAtom\|set(conversationsAtom" libs apps`, ignoring `dist/` and tests.
    The only insert of a saved row is the restore hook (`persistence/use-conversation-restore.ts:81-89`).
    The other writers are mint, clone, and remove (`state/conversation-actions.ts:25,203`,
    `state/conversation-store.ts:80,101`).
  - The list item has no unread field (`libs/app/src/lib/conversations.ts:11-15`).
    The saved `lastReadRunId` is never read for the list.
    `persistence/use-conversation-restore.ts:101-105` saves it so the row is "not shown as unread on next load".
  - So a run that finished in the background before a reload loses its dot.
    So does a run interrupted by shutdown, which the spec counts as finished.
    Opening the conversation then marks it read.
  - Breaks §Unread Status and the Core model definition ("the user has not opened the conversation since").
- 3. Spec violation, Must-fix: the sidebar does not re-sort when a run starts in an existing conversation.
  Decision: fixed by item 3.
  - After each save, `updateConversationsList` replaces the cached row's `updatedAt` in place and keeps the array
    order (`persistence/use-conversation-save-host.ts:61-80`).
    It refetches only for a conversation not yet in the list (:81).
    The comment at :57-60 assumes order matters only for new rows, but a run start stamps `updatedAt`
    (`state/conversation-store.ts:56-60`).
  - Nothing else re-sorts until another invalidation: a new conversation's first save, clone, delete, or a refocus
    after the 60 s `staleTime` (`libs/app-react/src/lib/app-providers.tsx:62`).
    The previous and next conversation hotkeys walk the same stale order
    (`libs/app-react/src/lib/routes/_.ai.tsx:78-88`).
  - The report's probe: cached list [B at 2000, A at 1000]; submit in A and save.
    The cache is `B@2000, A@new`, and it is not invalidated.
  - Breaks §Conversation List: "sorted by most recently updated".
  - `persistence/use-conversation-save-host.test.tsx` seeds one-row lists only (:119, :166, :205).
- 4. Spec violation, Should-fix: a row stays a draft until the first save after its first submit.
  Decision: fixed by item 5.
  - The row's dimming and its no-confirm delete read `hasTurns` from the cached query row
    (`ui/assistant-conversations-list.tsx:139,154`; `ui/delete-conversation-button.tsx:33-42`).
    The header menu reads the live store instead (`ui/delete-conversation-menu-action.tsx:21-29`).
  - While a run streams, saves are throttled to one per second after the last flush
    (`libs/assistant/src/lib/create-save-scheduler.ts:1,54-76`).
    Typing the prompt just saved, so the first post-submit save usually waits for the trailing edge.
    Until then the row deletes on one click, mid-stream, with no confirmation.
  - Both e2e suites wait for the flip to avoid this (`apps/web-e2e/src/assistant-conversations.spec.ts:288-291`;
    `apps/electron-e2e/src/assistant-conversations.spec.ts:376`).
  - Breaks §Delete: "Delete still asks for confirmation after a run has been submitted."
- 5. Spec violation, Later: clone drops a streaming run's messages, but the spec says all messages are copied.
  Decision: fixed by item 8; product decision taken at triage (question 2).
  - `cloneConversationAtom` drops the user and assistant message pair of a streaming run
    (`state/conversation-actions.ts:165-171`).
  - §What Gets Cloned lists "All messages (user and assistant)" (spec :107); only the next bullet excludes the
    streaming run (:108).
  - Cloning while the first and only run streams gives an empty clone named Untitled, though "Conversation name" is
    listed as copied (:111).
    The menu allows it, because `assistantConversationHasContextAtom` is true while a run is active
    (`state/conversation-selectors.ts:36-40`; `ui/clone-conversation-button.tsx:18-20,29`).
- 6. Spec violation, Later: the conversation menu is disabled for a conversation without messages; the spec does not
  say so.
  Decision: fixed by item 8.
  - `ui/conversation-header-menu.tsx:22-23,52` disables the whole menu, and `ui/clone-conversation-button.tsx:18-20,29`
    disables Clone, unless the conversation has messages or an active run.
  - §Clone Trigger says only that cloning is triggered from the conversation menu (spec :124).
- 7. Spec violation, Later: New is disabled when a conversation fails to load on a cold start.
  Decision: fixed by item 7.
  - The New button and hotkey gate on the store's current id (`state/conversation-selectors.ts:34`;
    `ui/assistant-new-conversation-button.tsx:15,21`; `ui/use-assistant-chat-hotkeys.ts:28,34-37`).
  - On a load error, the restore effect returns before setting the current id
    (`persistence/use-conversation-restore.ts:67`).
    On a cold start that id is still `null`, so New is disabled while the URL names a conversation.
  - Breaks §Conversation List: "disabled only when the open surface has no conversation id".
- 8. Spec violation, Later: the spec restates its own rules.
  Decision: fixed by item 9.
  - Each Relationships bullet is repeated in a later section: "Working takes priority over unread" (:33, :77);
    "already read" (:34, :88-89); "Clone is a new identity" (:35, :115); "Delete cannot be undone" (:36, :137).
  - The timestamp rule appears at :46-48 and again at :57.
  - FUNCTIONAL-SPECIFICATIONS.md (§Core model) makes Relationships the home of this spec's invariants, and
    §Principles asks for one home per rule.
- 9. Risk, Should-fix: reopening a conversation deleted earlier in the session gives an editor that never saves.
  Decision: fixed by item 6.
  - A successful delete leaves a permanent tombstone for the session
    (`libs/assistant/src/lib/conversation-persistence-host.ts:116,130`).
  - History can still hold the deleted id: visit A, then B, delete A from the sidebar, press Back.
  - Restore finds no row and inserts a fresh conversation under that id
    (`persistence/use-conversation-restore.ts:87-89`).
    Every save for the id is then dropped, because no queue is created for a tombstoned id
    (`conversation-persistence-host.ts:54-55,77-78`); the write adapter returns early too
    (`persistence/conversation-write-adapter.ts:41`).
  - The report's probe: tombstone X, mount restore for X, type a prompt.
    X is in the store with the prompt, and no write is attempted.
    No save error shows, so typed text and any run are lost on reload.
  - Neither spec describes opening an id that has no saved row.
    `persistence/use-conversation-restore.test.tsx:53` and the web e2e "recovers when the stored active conversation
    id has no row" pin the fresh-conversation behavior for stale pointers; that stays.
- 10. Risk, Later: the list query loads every conversation's full state on both hosts.
  Decision: partly fixed by item 14 (`exact: true`); the summary column is skipped (question 3).
  - Web selects `state` for every row and parses it to compute `hasTurns`
    (`libs/db-sqlite/src/lib/conversations.ts:15-31`, `libs/db-sqlite/src/lib/columns.ts:18`).
    Desktop sends every full row over IPC and computes it in the renderer
    (`apps/electron-react/src/app/queries.ts:67-73`, `crates/koloda/src/repo/conversations.rs:42-64`).
  - The list refetches on each new conversation's first save, each clone, each delete, and on refocus after the
    stale time, so its cost grows with all chat history.
  - The list invalidations use the `["conversations"]` prefix (`persistence/use-conversation-save-host.ts:81`,
    `ui/use-delete-conversation.ts:29`, `ui/assistant-conversation-recovery.tsx:64,92`).
    So they also refetch the open conversation's detail query (`libs/core-react/src/lib/query-keys.ts:34-36`), whose
    result restore then ignores.
  - Skipped: a `has_turns` (and unread) column written by the saver.
    No cost has been measured, and entry 2 adds a second flag derived from state, so a column design should cover
    both at once.
    `libs/app/src/lib/conversations.ts:63-64` forbids parsing state in Rust, so it needs a schema change on both
    hosts (`agents/DB.md`).
- 11. Improvement, Later: the header menu's draft-delete branch cannot run, and its test builds an impossible state.
  Decision: fixed by item 10; drop the branch (question 4).
  - The menu is enabled only when the conversation has messages or an active run (`ui/conversation-header-menu.tsx:52`).
    Either implies `conversationHasTurns`, so `onDraftDelete` (`ui/conversation-header-menu.tsx:65-68`,
    `ui/delete-conversation-menu-action.tsx:34-37`) is unreachable.
  - Every writer of `activeRunId` also creates the run.
    Search: `grep -n "activeRunId = " libs/assistant-react/src/lib/state/*.ts`.
  - `ui/conversation-header-menu.test.tsx:69-106` gets there with `activeRunId: "r1"` and `runs: {}`, which no
    reducer path produces.
- 12. Improvement, Later: clone comments, and one clone test, state a rationale the code does not follow.
  Decision: fixed by item 11.
  - `state/conversation-actions.ts:145-155` says the sidebar shows the clone "in a single synchronous write" through
    derived atoms.
    The sidebar is the DB query (`ui/assistant-conversations-list.tsx:28`); it gets the clone only after the first
    save invalidates the list (`persistence/use-conversation-save-host.ts:81`).
  - `state/conversation-actions.ts:186-191` says a `null` `updatedAt` makes the clone sort by `createdAt`.
    Both repos stamp `now` for a null `updatedAt` (`libs/db-sqlite/src/lib/conversations.ts:36-37`), so the clone goes
    to the top, which §Clone Trigger asks for.
    Its "the next content-changing dispatch stamps a real updatedAt" is also false; only a run start stamps
    (`state/conversation-store.ts:56-60`).
    The real path: the first save stamps the time, and the ack writes it back
    (`persistence/conversation-write-adapter.ts:82-87`).
  - `state/assistant-conversation-clone.test.ts:323-346` pins `updatedAt === null` under that rationale.
    It would pass if the clone sorted wrongly, so it fails TESTING.md's survival question.
- 13. Improvement, Later: unused ways to create a conversation.
  Decision: fixed by item 12.
  - `ensureConversationId`'s third branch (`runs/use-assistant-session.ts:113-119`) mints a conversation from the
    global record, but it cannot run.
    Submit needs a non-empty prompt, and with no current id the composer holds only whitespace
    (`state/conversation-selectors.ts:19-22`, `state/conversation-actions.ts:104-107`).
    The first other character mints and navigates (`ui/assistant-chat.tsx`, the mint effect).
    `handleGenerate` ignores the return value and reads the id from state (`runs/use-run-orchestration.ts:118-125`).
  - `newConversationAtom` keeps an optional `id`, a `{}` default, and a `generateUUID` fallback
    (`state/conversation-actions.ts:70-82`).
    Its one caller always passes an id (`ui/assistant-conversation-recovery.tsx:95`).
    The exported `NewConversationPayload` type has no importer.
    Search: `grep -rn "newConversationAtom\|NewConversationPayload" libs apps`.
  - CODE-STYLE.md (§Change Discipline) forbids optional parameters kept for future use.
- 14. Improvement, Later: the recovery screen re-implements the delete wiring and the delete popover.
  Decision: fixed by item 13.
  - `ui/assistant-conversation-recovery.tsx:53-70` repeats the `deleteAssistantConversation` call from
    `ui/use-delete-conversation.ts:18-36`.
  - `ui/assistant-conversation-recovery.tsx:184-212` repeats `DeleteConversationConfirmContent`
    (`ui/delete-conversation-confirm-dialog.tsx:13-46`) line for line.
  - They have not drifted yet.
- 15. Improvement, Later: each list row runs its own minute timer.
  Decision: fixed by item 15.
  - `ConversationListTimestamp` starts a `setInterval` per row and re-renders each row once on mount through the
    immediate `tick()` (`ui/conversation-list-timestamp.tsx:51-56`).
- 16. Improvement, Later: the working and unread markers are invisible to assistive technology.
  Decision: fixed by item 16.
  - The markers are `<div aria-label=…>` with no role (`ui/assistant-conversations-list.tsx:134,136`).
    ARIA does not name a generic element, so screen readers skip both.
  - The e2e suites find them with CSS attribute selectors (`apps/web-e2e/src/assistant-conversations.spec.ts:25-31`,
    `apps/electron-e2e/src/assistant-conversations.spec.ts:28-34`), so no test notices.
- 17. Improvement, Later: the route header picks a class with a ternary.
  Decision: fixed by item 17.
  - `libs/app-react/src/lib/routes/_.ai.tsx:99`: `title ? "min-w-0" : "min-w-0 fg-disabled"`.
    CSS.md (§Conditional styling with `tailwind-variants`) asks for a `tv` recipe when a class depends on state.
- 18. Improvement, Later: test gaps.
  Decision: fixed by item 18; the unit cases ride with items 2–4.
  - Clone has no e2e in either suite.
    Search: `grep -rli clone apps/web-e2e/src apps/electron-e2e/src` finds only the algorithm and template clone specs.
  - No test at any layer sees list order after a run starts (entry 3).
  - The unread tests do not cover a retry, a mid-stream open (entry 1), or a reload (entry 2).
- 19. Risk, Should-fix (added at triage): `ui/assistant-conversations-list.test.tsx` fails in some shuffled file
  orders.
  Decision: fixed by item 1.
  - The earlier task saw it: `useLingui` runs without the file's `vi.mock("@lingui/react")` (:12-16).
    It reproduced on `7b8e8c1c`, before that task's changes.
  - `libs/assistant-react/vitest.config.mjs` runs files with `isolate: false`.
    Its WHY says "no file here mocks a module a sibling imports for real"; this flake says that is not true.
  - Items 3–5 and 16 add cases to this file.
- 20. Improvement, Later (host desync audit, finding 7): web copies the conversation list-item mapping instead of
  calling it.
  Decision: fixed by item 4.
  - Web `getConversations` builds each list item inline (`libs/db-sqlite/src/lib/conversations.ts:21-29`).
  - Desktop builds the same item with `toConversationListItem` (`apps/electron-react/src/app/queries.ts:72-73`),
    defined in `libs/app/src/lib/conversations.ts:76-84`.
  - The copies match today; entry 2 adds a field that would be written twice.
  - The host desync audit's task should record this entry as taken here.

Out:

- Findings the assistant conversations audit already carried (recovery reset, stale spec pointers,
  `assistantHasContextAtom`); they landed in `tasks/archive/assistant-conversations-audit.md`.
- The other assistant slices (messages, data access, card generation, settings, AI providers).
- A schema change for the list query (entry 10).

## Open questions

- [x] 1. Task shape: this report alone, or paired with the messages audit? — this report alone (human, 2026-10-21).
- [x] 2. Entry 5: cloning while the only run streams gives an empty Untitled clone.
  Disable Clone, or accept the empty clone in the spec? — disable Clone while nothing finished could be copied
  (human, 2026-10-21).
- [x] 3. Entry 10: add a summary column now, beyond `exact: true`? — no; defer it (human, 2026-10-21).
- [x] 4. Entry 11: drop the header's draft-delete branch, or enable the menu for drafts? — drop it (human, 2026-10-21).
- [x] 5. Flow? — `local`, the default.

## Plan

Paths without a package prefix are under `libs/assistant-react/src/lib/`.
Line numbers are at `d32fb02e`; when an earlier item moved them, find the code by its text.
`AR` below stands for `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner`.

- [x] 1. Make the conversation list test pass in any file order
  Goal (entry 19):
  - `ui/assistant-conversations-list.test.tsx` fails in some shuffled file orders: `useLingui` runs without the
    file's `vi.mock("@lingui/react")` (:12-16).
  - `libs/assistant-react/vitest.config.mjs` sets `isolate: false`, and its WHY claims no file mocks a module that a
    sibling imports for real.
  - Reproduce first: run `AR --sequence.shuffle.files --sequence.seed=<n>` over seeds until it fails.
    Find which sibling loads `@lingui/react` or the list component for real before this file's mock applies.
  - Fix the file, or the sibling, so the WHY in the config is true again.
    If the claim cannot hold for this file, say so in the WHY and fix the cause locally; do not turn isolation on for
    the whole package.
  Constraints: the list test, the sibling that leaks, and the config's WHY only.
  Done: `conversation-list-timestamp.test.ts` imports the real timestamp component, which binds the real `useLingui`.
  The `@lingui/react` stub moved to `src/test-setup.ts` (TESTING.md §Runner constraints names that replacement), and
  the ten identical file-level copies were deleted; the config's WHY holds again unchanged.
  Done when:
  - `AR` passes with `--sequence.shuffle.files` for seeds 1–8, including the seed that failed before;
  - the cause is named in the commit body.
  Manual verify: none — test infrastructure only.
  Commit: Make the conversation list test pass in any file order
  Depends on: none

- [x] 2. Mark a run read only once it has finished
  Goal (entries 1 and 18):
  - In `transitionRun`'s restart branch (`state/conversation-run-lifecycle.ts:22-53`), clear `lastReadRunId` when it
    equals the restarted id, next to the `dismissedRunErrorId` clear at :43-44.
    Retry reuses the run id, so a read id left in place hides the retry's finish.
  - `markRead` (`state/conversation-session.ts:55-59`) returns without change when the run is streaming.
  - `setCurrentConversationIdAtom` (`state/conversation-store.ts:166-185`) skips the mark and the touch when the latest
    run is streaming.
    `markReadIfCurrent` (:105-112) already marks a run that ends while its conversation is open.
  - In `state/assistant-conversation-unread.test.ts`, replace the restart pin at :176-197 with a case that asserts
    `lastReadRunId` is cleared on restart.
    Add the report's two probes:
    a retry in A, then switch to B, then A's run completes: A is unread;
    submit in A while on B, open A mid-stream, go back to B, then A's run completes: A is unread.
    Add one case where the run completes while A is still open: A is read.
  Constraints: the three state files and the unread test file.
  Done when:
  - `AR conversation-unread conversation-reducer` passes, and both probe cases fail against the old code;
  - Manual verify (web), with a prompt that takes a while to answer:
    - send in A, open B, open A while it still streams, open B again before it ends → A shows the unread dot;
    - send in A and cancel it, Retry, open B before it ends → A shows the unread dot;
    - stay on A until a run ends → no dot after leaving A.
  Commit: Mark a run read only once it has finished
  Depends on: none

- [x] 3. Re-sort the sidebar when a save changes a row's timestamp
  Goal (entries 3 and 18):
  - `updateConversationsList` (`persistence/use-conversation-save-host.ts:61-82`) replaces a cached row in place and
    keeps the array order.
    A run start stamps `updatedAt` (`state/conversation-store.ts:56-60`), so the row must move.
  - When the written row's `updatedAt` differs from the cached item's, sort the new list by `updatedAt` desc, then
    `createdAt` desc.
    That is both repos' `ORDER BY updated_at DESC, created_at DESC` (`libs/db-sqlite/src/lib/conversations.ts:18`).
    Keep the in-place update when only the title or `hasTurns` changed, and keep the refetch for a row not in the list.
  - Rewrite the WHY at :57-60: order matters whenever `updatedAt` moves, not only for new rows.
  - In `persistence/use-conversation-save-host.test.tsx`, add a two-row case:
    seed [B at 2000, A at 1000], save A with a later `updatedAt`, and expect [A, B] with no refetch.
    Add one case where a title-only save keeps the order.
  Constraints: the save host and its test.
  Done: the cached list is re-sorted on every in-place update, not only when `updatedAt` moved.
  That is as correct and has no branch, so the planned title-only case would pass either way; it was not added.
  The existing cases seeded list timestamps as strings, which the `Date` type forbids; they now seed `Date`s.
  Done when:
  - `AR use-conversation-save-host` passes, and the two-row case fails against the old code;
  - Manual verify (web): with three conversations, open the bottom one and send a message → it moves to the top at once;
    the previous and next conversation hotkeys then follow the new order.
  Commit: Re-sort the sidebar when a save changes a row's timestamp
  Depends on: none

- [x] 4. Keep unread indicators across a reload
  Goal (entries 2, 18, and 20):
  - Add `conversationIsUnread(state: unknown): boolean` next to `conversationHasTurns` in
    `libs/app/src/lib/conversations.ts`.
    It reads the saved shape the same way the live predicate does (`state/conversation-selectors.ts:81-93`):
    the latest run is the last key of `runs`; no runs means not unread; unread when that run's id is not
    `lastReadRunId`.
    A saved `streaming` run counts as finished, because restore turns it into an interrupted run.
  - Add `isUnread` to `ConversationListItem` and `conversationListItemSchema`, and set it in `toConversationListItem`.
  - Entry 20: web `getConversations` (`libs/db-sqlite/src/lib/conversations.ts:15-31`) maps rows with
    `toConversationListItem` before the list-item parse, instead of its inline copy.
    Desktop already uses it (`apps/electron-react/src/app/queries.ts:67-73`); no Rust or IPC change.
  - The save host's `updateConversationsList` keeps the cached row's `isUnread` in step, as it does `hasTurns`.
  - In `ui/assistant-conversations-list.tsx`, a row whose conversation is in the store uses the live
    `unreadConversationIdsAtom`; any other row uses its `isUnread`.
    Read store membership through a membership-stable set, as `activeRunConversationIdsAtom` does
    (`state/conversation-selectors.ts:57-77`), so the sidebar does not re-render at chunk rate.
    If this makes a third copy of that stable-set pattern, extract one helper for the copies.
  - Tests:
    `libs/app/src/lib/conversations.test.ts` covers `conversationIsUnread` (no runs, read latest, unread latest, saved
    streaming latest) and `toConversationListItem`'s new field;
    `libs/db-sqlite/src/lib/conversations.integration.test.ts` checks `isUnread` from `getConversations`;
    `ui/assistant-conversations-list.test.tsx` checks that a row outside the store shows its flag and a row in the
    store follows the live set;
    the selector stable-reference test covers the new set.
  Constraints: `libs/app` conversations, `libs/db-sqlite` conversations, the save host, the list, the selectors, and
  their tests.
  Done: the three stable sets share `membershipStableSetAtom` in `state/conversation-selectors.ts`, so the existing
  stable-reference test in `state/assistant-conversation-unread.test.ts` covers the new `loadedConversationIdsAtom`.
  `libs/db-sqlite/README.md` now names `toConversationListItem` as the list mapping.
  No schema change; `state` stays unparsed in Rust (`libs/app/src/lib/conversations.ts:63-64`).
  Done when:
  - `bunx vitest run --config libs/app/vitest.config.mjs --configLoader runner conversations`,
    `bunx vitest run --config libs/db-sqlite/vitest.config.mjs --configLoader runner conversations`, and
    `AR conversations-list conversation-selectors use-conversation-save-host` pass;
  - `bun run typecheck` passes;
  - Manual verify (web and desktop, since both list hosts change):
    - send in A, open B before A ends, reload after A ends → A shows the unread dot; open A → the dot clears and stays
      cleared after another reload;
    - send in A, open B while A streams, reload → A shows the unread dot (interrupted counts as finished).
  Commit: Keep unread indicators across a reload
  Depends on: 1, 2

- [x] 5. Read a sidebar row's draft state from the live conversation
  Goal (entry 4):
  - The row's dimming and its no-confirm delete read `hasTurns` from the cached query row
    (`ui/assistant-conversations-list.tsx:139,154`; `ui/delete-conversation-button.tsx:33-42`).
    The first save after a submit can wait up to the one-second stream throttle, so a streaming conversation deletes
    without confirmation until then.
  - Use the live rule item 4 set up: a row whose conversation is in the store uses `conversationHasTurns` of the store
    entry, through a membership-stable set of ids with turns; any other row uses the cached `hasTurns`.
    Pass that value to `DeleteConversationButton` and to the title's `isDraft`.
  - Add a case to `ui/assistant-conversations-list.test.tsx`: a cached row with `hasTurns: false` whose store entry has
    a submitted turn renders as not a draft, and its delete opens the confirmation.
  - The e2e waits for `data-has-turns="true"` (`apps/web-e2e/src/assistant-conversations.spec.ts:288-291`,
    `apps/electron-e2e/src/assistant-conversations.spec.ts:376`) stay; update their WHY comments, since the flip is now
    immediate.
  Constraints: the list, its test, the selectors, and the two e2e comments.
  Done when:
  - `AR conversations-list conversation-selectors` passes, and the new case fails against the old code;
  - Manual verify (web): send a first message and, while it streams, hover its sidebar row and press delete → the
    confirmation opens; the row is not dimmed.
  Commit: Read a sidebar row's draft state from the live conversation
  Depends on: 4

- [x] 6. Leave a conversation that was deleted earlier in the session
  Goal (entry 9):
  - Delete leaves a permanent tombstone for the session (`libs/assistant/src/lib/conversation-persistence-host.ts:130`).
    Navigating back to that id restores it as a fresh conversation (`persistence/use-conversation-restore.ts:87-89`),
    and every save for it is dropped.
  - In the restore effect, before the "missing" upsert, check
    `ensureAssistantPersistenceHost(store).isTombstoned(conversationId)` (`runs/assistant-persistence-host.ts:39`).
    For a tombstoned id, do not upsert and do not touch.
    Report it from the hook (for example `isDeleted`), and have `AssistantChat` call `onActiveDeleted`, which takes the
    route to the AI route with no conversation id, as delete-of-open does.
  - Keep the fresh-conversation path for an id that has no row and no tombstone
    (`persistence/use-conversation-restore.test.tsx:53`).
  - Spec: add one sentence to §Deleting the Open Conversation saying that returning to a deleted conversation, such as
    with Back, also lands on the AI route with no conversation id.
  - Tests: a `use-conversation-restore.test.tsx` case for a tombstoned id (nothing upserted, nothing dirtied, the hook
    reports it); a chat integration case that `onActiveDeleted` is called.
  Constraints: the restore hook, `useConversationPersistence`, `AssistantChat`, their tests, and the spec sentence.
  Done: no chat integration case was added.
  No test renders `AssistantChat`; the integration file drives hooks through a harness.
  The chat side is a one-line effect (pure wiring per TESTING.md), and the hook test owns the behavior.
  The hook leaves its restored-id ref unset for a deleted id, so the chat stays on the restoring branch until it leaves.
  Done when:
  - `AR use-conversation-restore assistant-chat-integration` passes;
  - Manual verify (web): open A, then B, delete A from the sidebar, press Back → the AI route with no conversation id
    and an empty composer; Forward returns to B.
  Commit: Leave a conversation that was deleted earlier in the session
  Depends on: none

- [x] 7. Enable New whenever the route names a conversation
  Goal (entry 7):
  - New's button and hotkey gate on the store's current id (`state/conversation-selectors.ts:34`;
    `ui/assistant-new-conversation-button.tsx:15,21`; `ui/use-assistant-chat-hotkeys.ts:28,34-37`).
    On a cold start whose load fails, restore returns at `persistence/use-conversation-restore.ts:67` before setting
    that id, so New stays disabled while the URL names a conversation.
  - Gate both on the route's `conversationId`, which both callers already have:
    `AssistantNewConversationButton` is rendered by `libs/app-react/src/lib/routes/_.ai.tsx:93`, and `AssistantChat`
    owns the hotkey hook and gets `conversationId` as a prop.
    Delete `assistantCanStartNewConversationAtom` once nothing reads it.
    Its cases in `state/conversation-mint.test.ts:72-81` move to `ui/use-assistant-chat-hotkeys.test.tsx` and a new
    `ui/assistant-new-conversation-button.test.tsx`: disabled with no route id, enabled with one even when the store
    has no current id.
  - Keep the WHY comments that say why the param-less surface disables New.
  Constraints: the button, the hotkey hook, `AssistantChat`, the route, the selector, and their tests.
  Done when:
  - `AR new-conversation chat-hotkeys conversation-mint` and
    `bunx vitest run --config libs/app-react/vitest.config.mjs --configLoader runner` pass;
  - `bun run typecheck` passes.
  Manual verify: none — a load error on the detail query cannot be produced from the UI; the new tests drive it.
  Commit: Enable New whenever the route names a conversation
  Depends on: none

- [x] 8. Disable Clone while there is nothing finished to copy
  Goal (entries 5 and 6):
  - Clone drops a streaming run's message pair (`state/conversation-actions.ts:165-171`).
    During the only run, the clone is an empty Untitled conversation, and the button allows it
    (`ui/clone-conversation-button.tsx:18-20,29`).
  - Enable Clone only when the clone would keep at least one message: some message outside a streaming run.
    Give the clone button its own per-id atom for that.
    The header menu keeps its current gate (`ui/conversation-header-menu.tsx:22-23,52`), since it also holds Delete.
  - Spec, §What Gets Cloned: messages are copied except the turn of a run that is still streaming; the name follows
    the copied messages.
    §Clone Trigger: Clone is disabled while nothing finished could be copied, and the conversation menu is
    unavailable for a conversation with no messages.
  - Tests: `state/assistant-conversation-store.test.ts` (next to the `assistantConversationHasContextAtom` cases at
    :596-623) covers the new atom: only a streaming first run → false; a finished run and a streaming retry → true.
    A `ui/conversation-header-menu.test.tsx` case checks that Clone is disabled while the only run streams.
  Constraints: the clone button, the selectors, their tests, and the two spec sections.
  Done: the name line in §What Gets Cloned stays as it was.
  Clone now needs a finished turn, and only the latest run can stream, so the first user message is always copied.
  Done when:
  - `AR conversation-store clone conversation-header-menu` passes;
  - Manual verify (web): send the first message, open the menu while it streams → Clone is disabled; after the run
    ends → Clone is enabled and the clone has the turn and the name.
  Commit: Disable Clone while there is nothing finished to copy
  Depends on: none

- [x] 9. State each conversation list rule once in the spec
  Goal (entry 8):
  - Keep the Relationships bullets (FUNCTIONAL-SPECIFICATIONS.md §Core model makes them the home of this spec's
    invariants) and cut the section copies:
    "Working takes priority over unread" at :77; the open-conversation read rule at :88-89; the clone's new ID at
    :115; "Delete cannot be undone" at :137.
  - Keep the timestamp rule in §Conversation List (:57-59).
    In §Creating a Conversation keep only that creation sets the timestamp (:46), and drop :47-48.
  - Re-read each section after the cut; a section that loses its only sentence keeps a pointer to §Relationships.
  Constraints: `docs/specs/ASSISTANT-CONVERSATION-LIST.md` only.
  Done when: `bun run check:markdown` passes, and each rule appears once.
  Manual verify: none — spec wording only.
  Commit: State each conversation list rule once in the spec
  Depends on: 6, 8

- [x] 10. Drop the header menu's unreachable draft delete
  Goal (entry 11):
  - The header menu is enabled only with messages or an active run (`ui/conversation-header-menu.tsx:52`), so
    `onDraftDelete` (:65-68; `ui/delete-conversation-menu-action.tsx:34-37`) never runs.
  - `DeleteConversationMenuAction` always requests confirmation; drop its `hasTurns` atom and `onDraftDelete`.
  - Delete `ui/conversation-header-menu.test.tsx:69-106`, which reaches the branch with `activeRunId: "r1"` and
    `runs: {}`, a state no reducer path produces.
  Constraints: the header menu, the menu action, and the header menu test.
  Done when: `AR conversation-header-menu` passes.
  Manual verify: none — the branch was unreachable; the confirming path is unchanged.
  Commit: Drop the header menu's unreachable draft delete
  Depends on: none

- [x] 11. Correct the clone comments and drop the null timestamp pin
  Goal (entry 12):
  - Rewrite the WHY at `state/conversation-actions.ts:145-155`: the clone reaches the sidebar through its first save,
    which invalidates the list; the store write is what the route navigates to.
  - Rewrite the WHY at :186-191: `null` lets the first save stamp the time, which puts the clone at the top, and the
    save's ack writes that time back (`persistence/conversation-write-adapter.ts:82-87`).
  - Delete the pin at `state/assistant-conversation-clone.test.ts:323-346`; it would pass if the clone sorted wrongly.
    The clone e2e in item 18 checks the sidebar position.
  Constraints: comments in `conversation-actions.ts` and that one test.
  Done when: `AR clone` passes.
  Manual verify: none — comments and a test only.
  Commit: Correct the clone comments and drop the null timestamp pin
  Depends on: none

- [x] 12. Delete unused ways to create a conversation
  Goal (entry 13):
  - Delete `ensureConversationId`'s third branch (`runs/use-assistant-session.ts:113-119`); it cannot run, because the
    first non-whitespace character mints the conversation before a submit is possible.
    Delete `localConversationIdRef` (:95-101) if nothing else reads it.
  - `handleGenerate` ignores the return value (`runs/use-run-orchestration.ts:118-125`).
    If no test needs the URL catch-up in the second branch, delete the callback and its option; otherwise make it
    return `void`.
  - `newConversationAtom` (`state/conversation-actions.ts:70-82`): make `id` required, drop the `{}` default and the
    `generateUUID` fallback, and stop exporting `NewConversationPayload`.
  Constraints: the session hook, the orchestration hook, `conversation-actions.ts`, and their tests.
  Done: no test needed the URL catch-up, and the mint already navigates when it assigns the id, so
  `ensureConversationId` and its orchestration option are gone.
  That left `conversationId` and `onConversationIdChange` unread in `useAssistantSession`, so both options went too,
  with their call sites in `AssistantChat`, the test harness, and the integration tests.
  Done when: `AR use-run-orchestration conversation-mint assistant-chat-integration` and `bun run typecheck` pass.
  Manual verify: none — dead paths only; the mint path is covered by `conversation-mint.test.ts`.
  Commit: Delete unused ways to create a conversation
  Depends on: 7

- [x] 13. Reuse the delete hook and popover on the recovery screen
  Goal (entry 14):
  - Replace `removeBlockedRow` and the delete mutation (`ui/assistant-conversation-recovery.tsx:53-70,101-112`) with
    `useDeleteConversation` (`ui/use-delete-conversation.ts`), calling `onDeleted` on success.
  - Replace the delete popover body (:184-212) with `DeleteConversationConfirmContent`
    (`ui/delete-conversation-confirm-dialog.tsx:13-46`).
  - Leave the reset flow alone.
  Constraints: the recovery screen and its tests.
  Done when: `AR assistant-chat-integration` passes, including "recovery delete: explicitly removes the blocked row
  and notifies the route" (:1624).
  Manual verify: none — the recovery screen needs a corrupt row, which the UI cannot produce; the integration test
  drives delete, and the popover is the one the sidebar already uses.
  Commit: Reuse the delete hook and popover on the recovery screen
  Depends on: none

- [x] 14. Invalidate only the conversation list query
  Goal (entry 10, first half):
  - The list invalidations use the `["conversations"]` prefix, so they also refetch the open conversation's detail
    query (`libs/core-react/src/lib/query-keys.ts:34-36`), which restore then ignores.
  - Pass `exact: true` at `persistence/use-conversation-save-host.ts:81`, `ui/use-delete-conversation.ts:29`, and the
    recovery reset's invalidate (`ui/assistant-conversation-recovery.tsx:92`; item 13 removed the other site).
  Constraints: those call sites.
  Done when: `AR` passes in full.
  Manual verify: none — fewer refetches; the list behavior is unchanged.
  Commit: Invalidate only the conversation list query
  Depends on: 13

- [x] 15. Share one minute clock across the conversation list
  Goal (entry 15):
  - `ConversationListTimestamp` starts a `setInterval` per row and re-renders each row once on mount
    (`ui/conversation-list-timestamp.tsx:51-56`).
  - Replace it with one clock the rows read, for example an atom whose `onMount` starts the interval and sets the time
    once when the first row subscribes.
  - Update the timestamp tests to drive the shared clock with fake timers.
  Constraints: `conversation-list-timestamp.tsx` and its test.
  Done: the test file became `conversation-list-timestamp.test.tsx` to hold a component case: two rows advance
  together on one fake-timer minute, from one `setInterval`.
  Done when: `AR conversation-list-timestamp conversations-list` passes.
  Manual verify (web): leave the AI route open for two minutes → every row's age advances together.
  Commit: Share one minute clock across the conversation list
  Depends on: none

- [x] 16. Name the working and unread markers for screen readers
  Goal (entry 16):
  - Give each marker `role="img"`, keeping its `aria-label` (`ui/assistant-conversations-list.tsx:134,136`).
  - In both e2e suites, find the markers by role and name: `row.getByRole("img", { name: "Running" })` and
    `{ name: "Unread" }` (`apps/web-e2e/src/assistant-conversations.spec.ts:25-31`,
    `apps/electron-e2e/src/assistant-conversations.spec.ts:28-34`).
  - The row link's accessible name now includes the marker label.
    Check every exact-name match on a conversation row in both suites and `libs/e2e`.
  - Add a list unit case that finds each marker by role.
  Constraints: the list, its test, and the two e2e helpers.
  Done when: `AR conversations-list` and `bun run typecheck` pass; the human runs both assistant conversation e2e
  specs.
  Manual verify (web): with a screen reader, the sidebar row of a running conversation announces "Running".
  Commit: Name the working and unread markers for screen readers
  Depends on: 5

- [x] 17. Style the untitled route header with a tv recipe
  Goal (entry 17):
  - Replace the ternary at `libs/app-react/src/lib/routes/_.ai.tsx:99` with a module-level `tv` recipe that has an
    `isUntitled` variant (CSS.md §Conditional styling with `tailwind-variants`).
  Constraints: `_.ai.tsx` only.
  Done when: `bun run typecheck` passes.
  Manual verify (web): a new conversation's header title is dimmed until it has a name.
  Commit: Style the untitled route header with a tv recipe
  Depends on: 7

- [x] 18. Cover clone in both e2e suites
  Goal (entry 18):
  - Add one clone flow to `apps/web-e2e/src/assistant-conversations.spec.ts` and its desktop twin: send a message and
    wait for the reply; open the conversation menu → Clone; expect a second sidebar row with the same name at the top,
    the URL on the clone's id, and the copied messages in the log.
  - Use the existing helpers and the mock provider, as the other cases in those files do.
  Constraints: the two spec files; shared helpers go to `libs/e2e` only if both suites need them.
  Done when: `bun run typecheck` passes; the human runs both specs (`nx run web-e2e:e2e`, `nx run electron-e2e:e2e`,
  filtered to `assistant-conversations`).
  Manual verify: the e2e run above.
  Commit: Cover clone in both e2e suites
  Depends on: 8, 16

## Outcome

<what shipped>
