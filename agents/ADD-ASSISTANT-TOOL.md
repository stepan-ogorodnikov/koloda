# Adding a New Assistant Tool

**Input REQUIRED from user**: tool name (snake_case wire id), purpose, input fields, output shape,
tool kind (ordinary read | `propose_*` | direct write | needs new UI), whether new host data is required

**Critical**: Chat tools are always on.
There is no consent prompt, access mode, or setting that gates them.
Decks and cards are discovered through tools during the run — never baked into the system prompt.
Hosts bind data.
`libs/ai` owns specs, shaping, budgets, and the shared executor.

Read first: `docs/specs/ASSISTANT-DATA-ACCESS.md`, then the data-access row in `agents/ASSISTANT-MAP.md`.

## Tool kinds

Pick one before editing code.

1. **Ordinary read tool** (like `list_decks`, `get_deck_cards`):
   - Returns bounded user data for the model.
   - Needs a spec, a shared-executor branch, host data if new, activity label, docs.
   - Does not write run cards or write targets.

2. **`propose_*` tool** (like `propose_cards`):
   - Proposes structured content for the user to review; it is not a write.
   - Needs everything an ordinary tool needs, plus run-state mapping and card UI wiring.
   - First successful write target wins for the run.

3. **Direct write** (like `add_deck`):
   - Named host mutation (`createDeck`, and `getDefaultAlgorithmId` when the caller omits the algorithm).
   - Writes immediately after title, template, and algorithm validate. A failed validation leaves no row.
   - Does not invent cards and does not set a propose write target.
   - Undo is the existing product action (the user deletes the deck the same way as one they created by hand).
   - The write is invisible to a mounted list until the same React Query keys as the hand-created mutation are invalidated. `add_deck` does that from the app shell (`add-deck-query-invalidation.ts`), not from `libs/ai` or the host binders.
   - Needs a product rule in `docs/specs/ASSISTANT-DATA-ACCESS.md` (§Resources), host methods on `AssistantToolDataSource`, an executor branch, and an activity label.

4. **Tool that needs new UI**:
   - Same as the matching kind above, plus new activity rendering and/or a new message surface.
   - Unknown tool names already render as the protocol id.
   - Do not stop there if the product needs a label, icon, or summary.

## Overview

Adding a tool usually touches these layers:

| Layer | Path | Owns |
| --- | --- | --- |
| Spec / product rules | `docs/specs/ASSISTANT-DATA-ACCESS.md` | Reach, egress, budgets, visibility |
| Map routing | `agents/ASSISTANT-MAP.md` | Task → files for data-access / tools |
| Tool contract | `libs/ai/src/lib/assistant-tools.ts` | Spec, binder, pure output shaping |
| Shared executor | `libs/ai/src/lib/assistant-tool-executor.ts` | find-deck → find-template → shape |
| Wire names | `libs/assistant-react/src/lib/runs/build-stream-request.ts` | `tools: Object.keys(ASSISTANT_TOOL_SPECS)` |
| Stream binding | `libs/ai/src/lib/chat-stream.ts` | `bindAssistantTools`, step budget |
| Host binders | `apps/web/src/app/ai-runtime.ts`, `apps/electron/src/ai-ipc.ts` | `AssistantToolDataSource` → executor |
| Query cache | `libs/assistant-react/src/lib/runs/add-deck-query-invalidation.ts` | Direct-write invalidation after recorded success |
| Run mapping | `libs/assistant-react/src/lib/state/conversation-run-tools.ts` | Special cases (`propose_cards`) |
| Activity UI | `libs/ai-react/src/lib/ai-tool-activity.tsx` | Label, icon, compact summaries |
| Prompts | `libs/ai/src/lib/prompts.ts` | When the model must call the tool |

Chat always advertises every name in `ASSISTANT_TOOL_SPECS`.
Adding a spec entry is enough for wire registration if `build-stream-request.ts` still derives names from that object.

## Workflow

### 1. Confirm product rules

Update `docs/specs/ASSISTANT-DATA-ACCESS.md` when the tool changes reach, egress, budgets, or visibility.

Keep these invariants:

- Data access is always on for every provider.
- Discovery is tool calls during the run, not submit-time snapshots.
- Card bodies are field-title → text pairs by default; do not ship card ids unless the user explicitly requires them.
- Card content never persists without review; other assistant-driven writes need a named product spec with undo and validation (`docs/specs/ASSISTANT-DATA-ACCESS.md`, `docs/specs/ASSISTANT-CARD-GENERATION.md`).
- Tool activity lives on the run, not in follow-up history.

Also update the data-access / tools row in `agents/ASSISTANT-MAP.md` if primary files or the critical invariant change.

### 2. Add the tool contract (`libs/ai/src/lib/assistant-tools.ts`)

Add one entry to `ASSISTANT_TOOL_SPECS`:

- `name` — snake_case wire id (stable protocol id).
- `description` — tell the model when to call it, what not to ask the user, and what it cannot do.
- `inputSchema` — zod schema; coerce weak model shapes when needed (`propose_cards` is the template).

Add output types and a pure `shape…Output` helper when the tool returns structured data.

Respect existing budgets (or add named constants next to them):

- `ASSISTANT_TOOL_MAX_CARDS_PER_DECK` (200)
- `ASSISTANT_TOOL_CARD_LIST_CHAR_BUDGET` (8_000)

For list-like tools, report the true total when the returned slice is capped.
Do not silently drop the fact that truncation happened.

Export new public helpers from `libs/ai/src/index.ts` only when hosts or React need them.
`propose_cards` already exports `isProposeCardsOutput` and `generatedCardsFromProposeOutput`.

### 3. Extend the shared executor (`libs/ai/src/lib/assistant-tool-executor.ts`)

Add one `name === "…"` branch.

Reuse `resolveDeckTemplate` when the tool is deck-scoped.
Keep this module I/O-free: call only `AssistantToolDataSource` methods, then shape.

If the tool needs new reads, extend `AssistantToolDataSource` here first.
Then bind the new methods in both hosts (next step).

### 4. Bind host data sources

Hosts inject DB access into `createAssistantToolExecutor`.
Shaping and budgets stay in `@koloda/ai`.

**Web** — `apps/web/src/app/ai-runtime.ts`:

- Build the executor over in-process SQLite helpers (`getDecks`, `getTemplates`, `getCards`, `getCardCounts`).
- Attach it as `executeTool` when the chat request lists tools.

**Electron** — `apps/electron/src/ai-ipc.ts`:

- Build the executor over NAPI `KolodaDb` (sync reads).
- Recreate `executeTool` on the main side; functions do not cross IPC.
- Forward `onToolEvent` on the existing AI stream channel.

If `AssistantToolDataSource` gains a method, update both binders in the same change.

### 5. Wire names on the chat request

`libs/assistant-react/src/lib/runs/build-stream-request.ts` sets:

```ts
tools: Object.keys(ASSISTANT_TOOL_SPECS) as AssistantToolName[];
```

Do not hard-code a parallel name list unless you are intentionally subsetting.
`prepare-run-request.ts` must not reintroduce submit-time data injection.

`libs/ai/src/lib/chat-stream.ts` binds names through `bindAssistantTools`.
It caps tool loops with `CHAT_TOOL_STEP_BUDGET` (8).
A request that lists tools without an executor must fail fast.

### 6. Run-state and UI (kind-specific)

**Ordinary read tools**

- Activity row only: add a translated label (and icon/summary if useful)
  in `libs/ai-react/src/lib/ai-tool-activity.tsx`.
- Unknown names already fall back to the protocol id; still add a label for shipped tools.
- Add Lingui strings in both apps per `agents/I18N.md`.

**`propose_*` tools**

Follow `propose_cards`:

- Shape/coerce in `assistant-tools.ts`; drop invalid items without failing the whole call when that is the product rule.
- Map successful output onto the run in `conversation-run-tools.ts` (`applyProposeCardsToRun`).
- Parse the full tool output before truncating what is stored on the run record.
- Empty accept must not set write targets (`writeTargetDeckId`, `writeTargetTemplateId`, template fields).
- First write target wins; a later propose for another deck still records the tool row but must not retarget the run.
- Card review UI and add flow stay on write targets; see `docs/specs/ASSISTANT-CARD-GENERATION.md`.

**Direct writes**

Follow `add_deck`:

- Validate template and algorithm before calling the host write. A missing template, a missing requested algorithm, or a missing default algorithm fails the call and does not create a deck.
- When the caller omits the algorithm, store `getDefaultAlgorithmId()`, the same default as manual deck create.
- Do not map the result onto run cards or write targets.
- On recorded success, invalidate the same query keys as the hand-created mutation. `add_deck` does that in `invalidateDeckQueriesAfterAddDeck` (`add-deck-query-invalidation.ts`), called from `useAssistantEngineHost` after the reducer records the tool result. Host binders and `libs/ai` have no `QueryClient` — Electron runs the write in the main process.
- Activity row shows the translated label and, on success, the created title.

**Tools that need new UI**

- Extend activity rendering and/or add a message renderer under `libs/assistant-react/src/lib/ui/`.
- Keep tool traffic off follow-up model history (conversations spec).

### 7. Prompts

Update `libs/ai/src/lib/prompts.ts` when the default chat prompt must mention the new tool.

Field titles and deck ids come from tools, not from the system prompt.
If the model should call the tool instead of asking the user, say so explicitly.
See the `propose_cards` / `list_decks` lines today.

### 8. Tests

Minimum coverage:

- `libs/ai/src/lib/assistant-tools.test.ts` — schema, shaping, budgets, coerce/drop behavior.
- `libs/ai/src/lib/assistant-tool-executor.test.ts` — shared pipeline + unknown name error.
- Run/activity tests when the tool affects run state or compact summaries
  (`conversation-run-tools` / reducer tests, `ai-tool-activity` tests).
- Host or e2e coverage when the binder or IPC path changes
  (`apps/web-e2e`, `apps/electron-e2e` assistant specs are the existing pattern).

## Checklist

- [ ] User supplied name, purpose, input/output, and tool kind
- [ ] `ASSISTANT-DATA-ACCESS.md` (+ map row if routing/invariant changed)
- [ ] Spec entry + shaping in `assistant-tools.ts`
- [ ] Executor branch (+ `AssistantToolDataSource` fields if needed)
- [ ] Web and Electron host binders updated together
- [ ] Wire names still derived from `ASSISTANT_TOOL_SPECS` (or intentional subset documented)
- [ ] Activity label / i18n (and propose_*, direct-write, or new-UI paths if applicable)
- [ ] Direct writes name the host methods, validate before the write, and leave undo to the existing product action
- [ ] Direct writes invalidate the same React Query keys as the hand-created mutation, from the app shell on recorded success (`add-deck-query-invalidation.ts`)
- [ ] Prompts updated when the model must prefer the tool
- [ ] Budgets and “no card ids by default” respected
- [ ] Unit tests; e2e when host wiring changed

## Key files reference

| Layer | File | Purpose |
| --- | --- | --- |
| Spec | `docs/specs/ASSISTANT-DATA-ACCESS.md` | Product rules for tools |
| Map | `agents/ASSISTANT-MAP.md` | Ownership + task routing |
| Specs / shaping | `libs/ai/src/lib/assistant-tools.ts` | Registry, binder, budgets |
| Executor | `libs/ai/src/lib/assistant-tool-executor.ts` | Shared host-agnostic execution |
| Stream | `libs/ai/src/lib/chat-stream.ts` | Bind tools into `streamText` |
| Request prep | `libs/assistant-react/src/lib/runs/build-stream-request.ts` | Tool names on the wire |
| Web host | `apps/web/src/app/ai-runtime.ts` | SQLite `AssistantToolDataSource` |
| Electron host | `apps/electron/src/ai-ipc.ts` | NAPI binder + tool IPC events |
| Query cache | `libs/assistant-react/src/lib/runs/add-deck-query-invalidation.ts` | `add_deck` success → deck query invalidation |
| Run mapping | `libs/assistant-react/src/lib/state/conversation-run-tools.ts` | `propose_cards` → cards / write targets |
| Activity UI | `libs/ai-react/src/lib/ai-tool-activity.tsx` | Labels, icons, summaries |
| Prompts | `libs/ai/src/lib/prompts.ts` | Default tool-calling instructions |

## What not to do

- Do not inject deck or card snapshots into the system prompt.
- Do not add a consent toggle or per-provider data-access mode.
- Do not put DB I/O inside `libs/ai` tool modules.
- Do not put `QueryClient` invalidation in `libs/ai` or the host binders. Direct writes refresh caches from the app shell when the tool result is recorded.
- Do not return card ids in tool payloads unless product explicitly requires them.
- Do not fail an entire `propose_*` call because one item is malformed when the existing pattern is drop-and-count.
- Do not update only one host binder when `AssistantToolDataSource` changes.
