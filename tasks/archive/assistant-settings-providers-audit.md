# Assistant settings and AI providers audit fixes

Status: done
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, agents/ASSISTANT-MAP.md, docs/specs/AI-PROVIDERS.md, docs/specs/ASSISTANT-SETTINGS.md, docs/specs/HOTKEYS.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/CSS.md, agents/I18N.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, apps/electron/IPC.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of two audits of the assistant series, slices 6 and 7.
Both were audited at `d32fb02e` on 2026-10-20.

- Slice 7 covered the behavior owned by `docs/specs/AI-PROVIDERS.md`: built-in providers, platform availability,
  profiles, secrets, model lists, the allowlist, reasoning effort, and what a run sends to a provider.
  It also read the chat chrome in `libs/ai-react` that has no spec.
  Its report was `tmp/audits/ai-providers.md`.
- Slice 6 covered the behavior owned by `docs/specs/ASSISTANT-SETTINGS.md`: prompt source, custom prompt,
  temperature, the settings modal, and how saved values reach later runs.
  Its report was `tmp/audits/assistant-settings.md`.

Git ignores both reports.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs them.

The conversation list and messages fixes landed after the audit (`..5801f741`, `..f95547fa`).
Triage checked each finding again at `f95547fa`, where this task branches.
All 29 findings still hold; only line numbers moved.
One evidence correction: providers finding 12 missed a test consumer of the root `ChatStreamGenerator` export.

The providers report's verdict: the secrets boundary is sound.
Keys never cross IPC, public reads are redacted on both hosts, and the desktop writes the database before the keyring
and rolls back on failure.
The defects are in model selection and in what a run sends.
The settings report's verdict: the slice is small and mostly sound.
The prompt source is stored, not inferred, and runs read the query cache, never the form.
The defects sit at the modal's edges and in tests.

Done when:

- a models.dev model with effort levels and no catalog default sends no effort, so the provider's default applies;
- the effort picker offers Default for such a model, and choosing it clears a picked level;
- with no stored model, the selection falls back to the first allowlisted model, and an empty allowlist selects none;
- clearing a profile title in the edit dialog removes the title;
- editing a profile refreshes its model list, and the allowlist dialog fetches on open;
- the composer fetches other profiles' model lists only while the picker is open;
- an LM Studio base URL gives the model list and chat the same prefix;
- the context meter reads the last step of a tool run, not the sum of its steps;
- the `ai-react` suite passes in every file order;
- every close of the settings modal discards unsaved edits, the hotkey included;
- a settings row without a prompt source opens as Default;
- both hosts reject a provider change on update and show a failed delete;
- AI-PROVIDERS.md, ASSISTANT-SETTINGS.md, and HOTKEYS.md match the code;
- `bun run check:push` passes on the tip.

## Scope

Findings are numbered as in their reports, with a prefix: `P` for providers (slice 7), `S` for settings (slice 6).
Entries P20, P21, and S11 come from the reports' "seen in passing" notes.
Entry P22 was found during implementation.
Line numbers are at `f95547fa`.

### Providers (slice 7)

- P1. Spec violation, Must-fix: a models.dev model defaults to its lowest effort level, and runs send it.
  Decision: fixed by item 1; Default picker item added (question 2).
  - `effortLevelsFromCatalogRow` takes the default from `effort.default`, `effort.default_effort`, or
    `row.default_effort`, else `values[0]` (`libs/ai/src/lib/providers/models-dev.ts:65-72`).
  - The live catalog (downloaded 2026-10-20) has no such field on any effort row.
    That covers 32 `openai`, 4 `deepseek`, 79 `opencode`, and 23 `opencode-go` models.
  - So the default is always the first value: `gpt-5-mini` → `minimal`; `gpt-5.6-terra`, `gpt-6-luna` → `none`
    (reasoning off); `deepseek-v4-pro` → `low`; `kimi-k3` → `max`.
  - The picker shows that value when nothing is stored
    (`libs/assistant-react/src/lib/use-assistant-profile-selection.ts:122-126`).
    The run sends the shown value (`libs/assistant-react/src/lib/runs/use-assistant-session.ts:36`, `:42`).
    The provider's own default (OpenAI's is medium) never applies.
  - Breaks AI-PROVIDERS.md (§Sending Requests): "If the user did not set a level, the provider's default still applies."
    Also §Reasoning Effort: "The app does not guess levels outside these rules."
  - `models-dev.test.ts:39` pins the guess ("defaults to the first value when no default field is set").
  - LM Studio applies the same `values[0]` guess when its reported default is missing or not in the list
    (`libs/ai/src/lib/providers/lmstudio.ts:24-25`, pinned by `lmstudio.test.ts:37`).
- P2. Spec violation, Should-fix: the model fallback ignores the allowlist.
  Decision: fixed by item 3.
  - `resolvedModelId` keeps a stored model that is in the catalog, else takes `models[0]`
    (`use-assistant-profile-selection.ts:110-114`).
    `models` is the raw catalog (`:77`); the allowlist applies only inside the picker.
  - The picker keeps the current selection visible (`libs/ai-react/src/lib/filter-profile-models.ts:25`, `:28-30`),
    and submit is enabled.
  - Allowlist `[B]` with no stored model selects the catalog's first model `A`.
    With allowlist `[]`, `A` shows as selected and a run can be sent.
  - Breaks AI-PROVIDERS.md (§Allowlist): "Once a restriction is set, only the models on its list are available.
    An empty list allows no models."
  - No hook test covers the fallback with an allowlist (`use-assistant-profile-selection.test.tsx:74-190`).
- P3. Spec violation, Should-fix: clearing a profile title in the edit dialog is lost.
  Decision: fixed by item 4.
  - The edit form sends `title: value.title || undefined`
    (`libs/settings-react/src/lib/ai-providers/edit-ai-profile-form.tsx:35`, `:41`).
  - Web skips an `undefined` title (`apps/web/src/app/ai.ts:129`).
    Desktop skips `None` (`crates/koloda/src/repo/ai.rs:243-245`).
    The old title stays.
  - A whitespace-only title works: it is truthy, so it is sent, and both hosts normalize it to absent.
  - Breaks AI-PROVIDERS.md (§Validation): "A title that is empty or contains only whitespace is stored as absent."
  - `settings-ai-edit-profile.test.tsx` has one case, the error display; no title case.
- P4. Spec violation, Should-fix: a profile edit does not refresh its model list, and the allowlist dialog shows a
  cached list.
  Decision: fixed by item 6.
  - Both model hooks set `refetchOnMount: false` (`libs/ai-react/src/lib/use-ai-models.ts:13`,
    `use-ai-profiles-models.ts:30`).
  - Edit, allowlist save, add, and delete invalidate only the settings and profile queries
    (`libs/settings-react/src/lib/settings-ai-edit-profile.tsx:27-28`, `settings-ai-profile-models.tsx:54-55`,
    `settings-ai-add-profile.tsx:48-49`, `settings-ai-delete-profile.tsx:27-28`).
  - After the user replaces an API key or points LM Studio at another server, the picker keeps the old list until
    reload.
  - The allowlist dialog subscribes on open (`settings-ai-profile-models.tsx:32`).
    With a cached list it fetches nothing.
  - Breaks AI-PROVIDERS.md (§Allowlist): "The dialog fetches the profile's models when it opens."
- P5. Spec violation, Later: the picker loads every profile's model list when the chat mounts.
  Decision: fixed by item 7; the code moves, not the spec (question 9).
  - The composer's picker subscribes to every profile's list on mount, open or not
    (`libs/ai-react/src/lib/ai-model-profile-picker.tsx:59-60`).
  - Each profile's provider is called on the first AI route mount of a session.
    On desktop that includes the 5.9 MB models.dev download, even when the user never opens the picker.
  - AI-PROVIDERS.md (§Fetching): "The app fetches models when the user opens the model picker in a conversation".
- P6. Risk, Should-fix: LM Studio builds the model-list URL and the chat URL by different rules.
  Decision: fixed by item 8.
  - The OpenAI-compatible list uses an absolute path, `new URL("/v1/models", baseUrl)`
    (`libs/ai/src/lib/providers/openai-compatible.ts:55`).
    The native list does too, `new URL("/api/v1/models", baseUrl)` (`lmstudio.ts:71`).
    Both drop the base URL's path.
  - Chat uses `createOpenAICompatible({ baseURL: baseUrl })` (`libs/ai/src/lib/chat-stream.ts:273`).
    The SDK appends `/chat/completions` to the full base (`@ai-sdk/openai-compatible` 3.0.62,
    `dist/index.js:1427-1437`).
  - `http://localhost:1234/v1` (the form default) works for both.
    `http://localhost:1234` loads models but posts chat to `/chat/completions`, so every run fails.
    `https://box.lan/lmstudio/v1` (a proxy prefix) fails the model list while chat would work.
  - Tests cover only the `/v1` form (`openai-compatible.test.ts:153`, `lmstudio.test.ts:153`, `:159`).
- P7. Risk, Should-fix: the context meter counts every tool step of a run.
  Decision: fixed by item 9.
  - `runChatStream` returns `result.usage` (`chat-stream.ts:101-109`).
    Its WHY at `:101` says that total covers every tool step.
    The AI SDK 7.0.126 typings say the same (`dist/index.d.ts:2934-2935`).
  - The only reader is the context meter: `assistantContextUsageAtom`
    (`libs/assistant-react/src/lib/state/conversation-selectors.ts:55-68`), `ui/assistant-chat.tsx:84`, `:254`,
    and `libs/ai-react/src/lib/ai-chat-context-usage.tsx:16`, which divides `totalTokens` by the context length.
    Search: `grep -rn -E '\busage\b'` over `libs/assistant/src/lib` and `libs/assistant-react/src/lib`.
  - Each step resends the conversation, so a run with k steps reads about k times its last request.
    The tool budget allows 8 steps (`chat-stream.ts:17`).
  - No spec describes the meter.
- P8. Risk, Should-fix: the `ai-react` suite fails in some file orders.
  Decision: fixed by items 26 (the picker test) and 2 (the rest).
  - `libs/ai-react/vitest.config.mjs:17-19` sets `isolate: false`.
    Its WHY says "no file here mocks a module a sibling imports for real".
  - `ai-chat-error.test.tsx:13-20` file-mocks two `@koloda/core-react` hotkey hooks.
    `ai-tool-activity.test.tsx` loads the real `@koloda/ui`, which binds the real `@koloda/core-react`.
    When it runs first on the worker, both `AIChatError` cases fail with "Cannot destructure property
    'getSettingsQuery' of 'useAtomValue(...)' as it is null".
  - Reproduced with `--maxWorkers=1` in the default order, and with `--sequence.shuffle.files` seeds 2 and 3.
    The messages task saw the same failure again at `f95547fa`.
  - Two more files replace all of `@koloda/ui` with stubs (`ai-chat-message-status.test.tsx:12-18`,
    `ai-model-profile-picker.test.tsx:17`), while siblings render the real package.
  - CI is green only because the two workers happen to split these files apart (TESTING.md §Runner constraints).
- P9. Risk, Later: both hosts accept a provider change through update.
  Decision: fixed by item 15.
  - AI-PROVIDERS.md (§Editing a Profile): "The provider cannot be changed through edit".
    Only the UI holds the rule (`settings-ai-edit-profile.tsx:19`).
  - Desktop removes the old key when the provider changed (`repo/ai.rs:256-266`).
    Web stores the new secrets (`apps/web/src/app/ai.ts:137-146`).
  - `crates/koloda/tests/integration/ai_integration_tests.rs:406` pins an OpenRouter → Ollama update.
- P10. Risk, Later: a failed delete shows nothing.
  Decision: fixed by item 17.
  - `SettingsAIDeleteProfile` reads only `mutate` from `useMutation` (`settings-ai-delete-profile.tsx:18`).
  - Desktop `remove_ai_profile` rolls back and returns the keyring error (`repo/ai.rs:291-300`).
    The popover stays open with no message.
  - Add and edit both show the form error (`ai-providers/add-ai-profile-form.tsx:41`).
    §Deleting a Profile does not describe failure.
- P11. Improvement, Later: the output-limit overlay and four model fields have no reader.
  Decision: fixed by item 18.
  - `overlayFromModelsDev` fills `top_provider.max_completion_tokens` from `limit.output`
    (`models-dev.ts:37-52`, `:104`); the `libs/ai` README advertises it.
  - `AIModel.description`, `top_provider`, `architecture`, and `supported_parameters` are unread
    (`libs/ai/src/lib/models.ts:4-14`).
    Search: `grep -rn -E 'max_completion_tokens|top_provider|supported_parameters|architecture'` over `libs` and
    `apps`, excluding `providers/`, tests, and `dist/`, finds only `models.ts`.
  - `fetchOpenAICompatibleModelsDetailed` copies them (`openai-compatible.ts:89-100`).
    `models-dev.test.ts:145`, `:156`, and `:176` pin the output limit.
  - `context_length` is read (`ui/assistant-chat.tsx:111`), so the `limit.context` fill stays.
- P12. Improvement, Later: dead surface.
  Decision: fixed by item 19.
  - `getAIProfileModelsQuery` is on the `Queries` contract (`libs/core-react/src/lib/queries.ts:108`,
    `queries-contract.ts:52`).
    Both hosts implement it (`apps/web/src/app/queries.ts:201`, `apps/electron-react/src/app/queries.ts:225`).
    A test stubs it (`assistant-chat-integration.test.tsx:174`).
    No production caller: `grep -rn getAIProfileModelsQuery libs apps`.
  - `SettingsModelRow.isStale` is set (`libs/settings-react/src/lib/ai-profile-models-allowlist.ts:13`, `:58`, `:65`)
    but read only by its test (`ai-profile-models-allowlist.test.ts:82-106`).
  - `ChatStreamGenerator` is on the `@koloda/ai` root entry (`libs/ai/src/index.ts:17`).
    Production uses it only in `provider-registry.ts`.
    Correction at triage: `libs/assistant-react/src/lib/runs/use-conversation-runs.test.ts:1`, `:53` also imports
    it from the root (`grep -rn ChatStreamGenerator libs apps`).
- P13. Improvement, Later: two hooks build the same model-list query.
  Decision: fixed by item 5.
  - `useAIModels` and `useAIProfilesModels` build the same key and the same five options
    (`use-ai-models.ts:8-16`, `use-ai-profiles-models.ts:24-34`).
    `useAIModels` has one caller (`use-assistant-profile-selection.ts:77`).
  - The parameter and key argument are named `credentialId` (`use-ai-models.ts:6`,
    `libs/core-react/src/lib/query-keys.ts:16`), though they take a profile id.
- P14. Improvement, Later: optional fields that no writer uses.
  Decision: fixed by item 14; secrets become required (question 4).
  - Secrets are optional on profiles and on add: TS `aiProfileValidation.secrets` and `AddAIProfileData.secrets`
    (`libs/ai/src/lib/settings.ts:12`, `:88`); Rust `AIProfile.secrets` and `AddProfileData.secrets`
    (`crates/koloda/src/domain/ai.rs:17`, `:94`).
  - The only writer, the add dialog, always sends secrets (`settings-ai-add-profile.tsx:44`); its form props require
    them (`ai-providers/ai-profile-form-props.ts:4`).
  - Readers still branch on a missing provider: `settings-ai.tsx:31`, `:39`; `settings-ai-edit-profile.tsx:19`,
    `:39`; `settings-ai-profile-models.tsx:31`; `ai-model-profile-picker.tsx:70`; `use-ai-profiles.ts:18`;
    `use-assistant-profile-selection.ts:78`; web `apps/web/src/app/ai.ts:60`, `:81`; Rust `repo/ai.rs:150-152`,
    `:172-176`, `:193`.
  - AI-PROVIDERS.md (§Relationships): "A profile belongs to one provider."
  - `AddAIProfileData.whitelistModelIds` and Rust `AddProfileData.whitelist_model_ids` (`domain/ai.rs:95-96`) have
    no sender.
    `ai_integration_tests.rs:668` pins them.
  - A stored profile without secrets would then fail the whole `ai` settings parse; accepted under
    `agents/BACKWARDS-COMPATIBILITY.md` (question 4).
- P15. Improvement, Later: the stored `hasSecrets` flag is never authoritative, and the WHYs narrate older rows.
  Decision: fixed by item 16; the flag stays persisted (question 6).
  - Both hosts persist it (`repo/ai.rs:177`, `:240`, whose WHY at `:239` calls it "advisory";
    `apps/web/src/app/ai.ts:91`, `:147`).
  - Desktop ignores the stored value on every read (`repo/ai.rs:110-119`, `:133`).
    Web ORs it with key presence (`apps/web/src/app/ai.ts:55-56`), though on web the two are always equal.
  - `default(false)` exists on both sides "so stored settings without the field still parse"
    (`settings.ts:13-15`, `domain/ai.rs:18-21`).
  - Comments narrate older rows rather than the live rule: `domain/ai.rs:22-23`, `:30-32`; `repo/ai.rs:28-30`,
    `:110-112`; `libs/ai/src/lib/provider-secrets.ts:55-58`.
    The normalization stays; it is the live §Validation rule that whitespace in a key is absent.
- P16. Improvement, Later: DeepSeek starts the models.dev download only after its own list returns.
  Decision: fixed by item 20.
  - `fetchDeepSeekModels` writes `await fetch(…)` inside the `Promise.all` array
    (`libs/ai/src/lib/providers/deepseek.ts:21-31`).
    OpenAI and OpenCode start both requests at once (`openai.ts:13-16`).
- P17. Improvement, Later: repeated tests.
  Decision: Rust part fixed by item 21; picker part fixed by item 26.
  - Five keyring round-trip tests differ only by provider variant (`ai_integration_tests.rs:242`, `:276`, `:310`,
    `:342`, `:374`); TESTING.md (§Repetition and tables).
  - `ai-model-profile-picker.test.tsx:78`, `:93`, `:108`, and `:138` re-test allowlist rules through module mocks
    of `@koloda/ui`, `@lingui/react`, `motion/react`, and `./use-ai-profiles-models`.
    `filter-profile-models.test.ts:11-75` owns those rules (TESTING.md §One home per behavior).
    The empty-allowlist case (`:123`) is picker rendering and stays.
- P18. Product decision, Later: desktop-only profiles on web cannot arise, and nothing in chat blocks them.
  Decision: skipped; the current behavior is correct (question 7).
  - AI-PROVIDERS.md (§Platform Availability): "Profiles for a desktop-only provider remain visible but cannot be used."
  - No current web path creates one: the add picker disables those providers (`settings-ai-add-profile.tsx:34-37`,
    `:63-67`), AI settings are device-local, and web does not sync.
    Only older data reaches the per-profile warning (`settings-ai.tsx:32`, `:52-54`).
  - Ruling: the web app is the demo (`docs/decisions/APP-ROLES.md`).
    It lists every provider the product has and disables the ones CORS blocks in a browser, with a note.
    That Ruling already names AI-PROVIDERS.md §Platform Availability as its model.
    The spec sentence and the per-profile warning stay.
- P19. Product decision, Later: a stored optional API key cannot be removed.
  Decision: accepted and documented by item 15 (question 8).
  - For Ollama and LM Studio, an empty key field sends no key
    (`libs/settings-react/src/lib/ai-providers/ai-provider-form-config.ts:73-77`).
    Both hosts then keep the stored one (`repo/ai.rs:258-266`, `apps/web/src/app/ai.ts:142-143`).
  - So once an optional key is stored, only deleting the profile removes it.
- P20. Risk, Later (seen in passing): web `listModels` errors are not wrapped like desktop's.
  Decision: fixed by item 22.
  - Web calls `fetchModels(secrets)` bare (`apps/web/src/app/ai-runtime.ts:69-74`).
    Desktop wraps it in `wrapAIError` (`apps/electron/src/ai-ipc.ts:181`).
  - Nobody sees the difference today: the picker shows only a generic error label.
- P21. Improvement, Later (seen in passing): `update_ai_profile` looks the profile up three times.
  Decision: fixed by item 15.
  - Two of the three not-found branches are unreachable (`repo/ai.rs:219-235`).
- P22. Risk, Should-fix (found in item 2): an empty-allowlist profile crashes the model picker when its list arrives.
  Decision: fixed by item 26.
  - A section shows a loading row while its list loads, then an empty-models row for an empty allowlist
    (`libs/ai-react/src/lib/ai-model-profile-picker.tsx:145-160`, `:162-163`).
    Both are `Select.ListBoxItem`s in the same place with different ids, so React reuses the node.
  - The listbox collection throws "Cannot change the id of an item" when a mounted item's id changes
    (`react-aria` `dist/private/collections/Document.mjs:219`).
    The collection is built while the picker is closed too.
  - So after a reload, a profile with an empty allowlist breaks the composer's picker once its model list loads.
    The old picker test mocked `@koloda/ui`, so it could not see this.

### Settings (slice 6)

- S1. Spec violation, Should-fix: the toggle-settings hotkey closes the modal without discarding edits.
  Decision: fixed by item 10.
  - `AssistantChat` mounts the modal for the chat's lifetime and passes the raw setter as `onOpenChange`
    (`libs/assistant-react/src/lib/ui/assistant-chat.tsx:239`).
    `toggleSettings` flips the state directly (`:94`).
    The footer button (`:255`) and the hotkey (`ui/use-assistant-chat-hotkeys.ts:42`, `ignoreInputs: false`) use it.
  - Discard lives only in `handleOpenChange` (`ui/assistant-settings.tsx:71-79`), which runs only when react-aria
    closes the overlay (close control or Escape).
    The form stays mounted, so after a hotkey close the edits survive, and on reopen the form is dirty.
  - The report's probe: the real hotkey manager fires `Mod+Shift+S` with focus in the prompt textarea; after the toggle
    closes the modal, the reopened textarea holds the unsaved text.
  - Breaks ASSISTANT-SETTINGS.md (§What it is): "Closing the modal … discards unsaved edits."
  - The WHY at `assistant-settings.tsx:72-73` gives the wrong reason ("Overlay can keep the form mounted while
    closing").
  - The discard test (`ui/assistant-settings.test.tsx:152-173`) closes only through the close control.
- S2. Spec violation, Should-fix: the backdrop does not close the modal.
  Decision: fixed by item 10; the spec moves (question 10).
  - ASSISTANT-SETTINGS.md line 22 lists the backdrop as a close path.
  - `Dialog.Overlay` is a plain `ModalOverlay` (`libs/ui/src/lib/primitives/overlay/dialog.tsx:28-29`).
    react-aria 3.48.0 `useOverlay` defaults `isDismissable` to `false`.
    `git grep -n isDismissable -- libs apps` finds nothing; no dialog in the app closes on the backdrop.
- S3. Risk, Later: the temperature range has five homes, the comments point at one, and only desktop names the error.
  Decision: fixed by item 23.
  - The 0–2 range: `crates/koloda/src/domain/settings_ai.rs:15`; `libs/ai/src/lib/settings.ts:34`, `:42`;
    `libs/ai/src/lib/generation.ts:7`; the slider at `ui/assistant-settings.tsx:118`.
  - The Rust doc (`settings_ai.rs:12-14`) names a provider list, not the TS copies; the list omits `openai`.
    The module doc (`:3`) says bounds are enforced in TS `findDuplicateProfileId`, which checks only ids
    (`settings.ts:77-84`).
  - The TS schemas carry no message code; Rust returns `validation.assistant-settings.temperature-range`
    (`settings_ai.rs:93-109`).
    `ERROR_MESSAGES` has the key (`libs/app/src/lib/error.ts:88`), but only desktop can produce it.
- S4. Improvement, Should-fix: prompt-source inference for rows from before the source existed is still live.
  Decision: fixed by item 12; drop it (question 3).
  - `chatPromptMode` arrived on 2026-09-03 (`9b9485bb`, `503910fd`); the only writer always sends it
    (`ui/assistant-settings.tsx:28`, `:49`).
  - Still in place: `chatPromptMode: chatPromptModeSchema.optional()` (`settings.ts:36`); `resolveChatPromptMode`
    treats an omitted mode with a stored string as Custom (`settings.ts:54-59`); Rust
    `chat_prompt_mode: Option<ChatPromptMode>` with "Omitted on older settings rows" (`settings_ai.rs:38-41`).
  - Spec line 54, "A previously saved custom prompt stays Custom until the user chooses Default", is restore
    archaeology (FUNCTIONAL-SPECIFICATIONS.md §Principles).
  - Old-row tests: `libs/ai/src/lib/settings.test.ts:167-176`, `:178-185`, and the table row at `:219-224`;
    Rust `crates/koloda/tests/domain/settings_ai_tests.rs:482-499` and the omitted-mode cases at `:510-521`.
  - Stays: an absent `assistant` object resolves to Default (`settings.test.ts:213-218`).
    `chatPromptTemplate`'s `.default(null)` is load-bearing: a patch that sends `null` deletes the key, and the
    default refills it.
    `settings_ai_tests.rs:391` pins that; only its comment (`:392-394`, "an older settings row") is wrong.
  - Effect: a pre-September custom prompt opens as Default; its text stays as the Custom draft.
- S5. Improvement, Should-fix: nothing tests how the prompt is sent.
  Decision: fixed by item 13.
  - Rules: Default sends the built-in prompt trimmed, Custom sends the saved text trimmed, an empty custom prompt is
    sent empty, braces are literal (§How the Prompt Is Sent); unset temperature is 0.2 (§How Settings Apply to Runs).
  - Enforced at `chat-stream.ts:44`, `libs/assistant-react/src/lib/runs/build-stream-request.ts:31`, and
    `chat-stream.ts:11-13`.
  - No test reaches them: `git grep -n -E "instructions|systemPromptTemplate"` over the `libs/ai` and
    `libs/assistant-react` tests finds no send assertion.
    `??` → `||` on either line, or a dropped `.trim()`, would pass.
- S6. Improvement, Later: the cache-to-run path, Discard, and Escape have no test; two tests only check rendering.
  Decision: fixed by item 24.
  - `use-assistant-runtime-config.ts` has no test (`git grep -n useAssistantRuntimeConfig -- '*.test.*'`).
    Run tests feed a fixed config (`runs/prepare-run-request.test.ts:16`, `runs/use-run-orchestration.test.ts:31`).
  - "Discard restores the last saved values" (spec line 59) and the Escape close path have no test.
  - `ui/assistant-settings.test.tsx:86-92` and `:94-102` render the modal and assert it rendered
    (TESTING.md §Banned patterns).
- S7. Improvement, Later: no test on either host proves a profile write keeps the assistant settings.
  Decision: fixed by item 25.
  - Add, update, and remove rewrite the whole `ai` document (`apps/web/src/app/ai.ts:96-110`, `:126`, `:169`;
    `repo/ai.rs:77-91`).
  - `git grep -n -i -E "chatPrompt|\"assistant\"" -- crates/koloda/tests/integration` finds only a chat-message
    fixture; the web `ai.test.ts` cases set only `profiles`.
- S8. Improvement, Later: unused surface in the slice.
  Decision: fixed by item 11.
  - `AssistantSettingsPromptEditor`'s optional `isDisabled` (`ui/assistant-settings-prompt-editor.tsx:13`, `:23`,
    forwarded at `:37`, `:47`, `:50`, `:60`); its only caller does not pass it (`ui/assistant-settings.tsx:106-113`).
  - `AssistantSettingsFormValues` (`settings.ts:47`) has no reference (`git grep -n -w AssistantSettingsFormValues`).
  - Rust `impl Default for AssistantSettings` (`settings_ai.rs:44-52`) has no caller (`git grep -n AssistantSettings
    -- crates`); `AISettings` derives `Default` with `assistant: None`.
  - Four no-op casts: `ui/assistant-settings.tsx:39`, `:67`, `:75`; `use-assistant-runtime-config.ts:29`.
    `getSettingsQuery("ai")` already returns the `ai` content type (`libs/core-react/src/lib/queries.ts:54`).
- S9. Improvement, Later: the map row for settings omits `libs/ai` and the Rust twin.
  Decision: fixed by item 23.
  - `agents/ASSISTANT-MAP.md:40` lists three React files.
    The rules live in `libs/ai` `settings.ts`, `prompts.ts`, `chat-stream.ts`, and Rust `domain/settings_ai.rs`.
- S10. Improvement, Later: the spec states two temperature rules twice.
  Decision: fixed by item 23.
  - Rejection: line 62 (in §Prompt Template) and line 83.
    Default: line 81 and line 92.
    FUNCTIONAL-SPECIFICATIONS.md (§Principles, "One home per rule").
- S11. Spec violation, Later (seen in passing): HOTKEYS.md calls the modal a panel.
  Decision: fixed by item 10.
  - `docs/specs/HOTKEYS.md:125`: "Opens or closes the assistant settings panel."
    It has been a modal since `5bf8266c`.

Out:

- The settings report's other "seen in passing" notes, which it did not raise.
  The save settles in per-call `mutate` callbacks (`ui/assistant-settings.tsx:46-61`), the card-generation report's
  finding 1 pattern; a late save still lands while the chat stays mounted.
  Other settings forms use the same invalidate-then-`setQueryData` pair.
- Assistant slices 4 and 5 (data access, card generation); they get their own task.
- Splitting the stored and public AI profile shapes (question 6).
- Seen during self-review, not fixed (exists on `main`): `libs/settings-react` fails under
  `--maxWorkers=1 --sequence.shuffle.files`.
  At `f95547fa`, seeds 4, 5, 6, and 8 fail; seed 4 fails 40 tests.
  On this branch, seeds 4, 5, and 6 fail the same three `settings-sync-devices.test.tsx` cases ("Unable to find an
  element with the text: laptop"), and seeds 1–3, 7, and 8 pass.
  The pair of that file with `settings-ai-profile-models.test.tsx` passes in every order, so the leak needs a wider
  set; it belongs to a sync or settings-react task.

## Open questions

- [x] 1. Task shape: these two reports together, or one each? — together (human, 2026-10-23).
- [x] 2. P1: with no catalog default, how does the user get back to the provider default after picking a level? —
  a Default item first in the effort picker; choosing it clears the stored level (human, 2026-10-23).
- [x] 3. S4: drop the prompt-source inference for rows saved before the source existed? — drop it (human, 2026-10-23).
- [x] 4. P14: make secrets required, though a stored profile without them then fails the `ai` settings parse? —
  require them (human, 2026-10-23).
- [x] 5. Flow? — `local`, the default.
- [x] 6. P15: stop persisting `hasSecrets`? — no; the default below, accepted at plan approval (human, 2026-10-23).
  The stored and public profile are one type on both hosts (`aiProfileValidation`; Rust `AIProfile`, which also
  crosses IPC).
  Not persisting the flag needs a stored/public split, which is more than a local fix.
  Default: keep the flag persisted; drop web's OR; drop the `default(false)` older-row fallback on both sides, under
  question 4's ruling; reword the older-row WHYs.
- [x] 7. P18: drop the desktop-only-profile rule and warning, or have the web runtime refuse those providers? —
  neither; the current behavior is correct, per `docs/decisions/APP-ROLES.md` (human, 2026-10-23).
- [x] 8. P19: accept that a stored optional key cannot be cleared, or add a clear control? — accept and document
  (human, 2026-10-23).
- [x] 9. P5: fetch other profiles' lists only while the picker is open, or change §Fetching? — fix the code
  (human, 2026-10-23).
- [x] 10. S2: drop the backdrop from the spec, or make the modal dismissable? — fix the spec (human, 2026-10-23).
- [x] 11. P1: show the Default item only for a model whose rule gives no default? — yes, accepted at plan approval
  (human, 2026-10-23).
  Where the source reports a default (OpenRouter, LM Studio, Ollama, the fallback families), the picker keeps
  showing it, and a run keeps sending it.
  A Default item there would read the same as that level.
  Sending no level for those models would change what Ollama runs send.

## Plan

`AI`, `AIR`, `AR`, and `SR` below stand for
`bunx vitest run --config libs/<lib>/vitest.config.mjs --configLoader runner` with `ai`, `ai-react`,
`assistant-react`, and `settings-react`.
`WEB` stands for `nx run @koloda/web:test-unit`.
Line numbers are at `f95547fa`; when an earlier item moved them, find the code by its text.
Item 26 was added during implementation; it is committed before item 2, which it unblocks.

- [x] 1. Leave the reasoning effort unset when the catalog gives no default
  Goal (P1; questions 2 and 11):
  - `effortLevelsFromCatalogRow` (`libs/ai/src/lib/providers/models-dev.ts:65-72`): drop the `?? values[0]`.
    With no default candidate, the row has levels and no default; make `ReasoningLevels.default` (`:16-19`) optional.
  - `lmStudioReasoningFromCapabilities` (`libs/ai/src/lib/providers/lmstudio.ts:24-25`): leave
    `default_reasoning_level` unset when the reported default is missing or not in the list.
  - Rewrite `models-dev.test.ts:39` and `lmstudio.test.ts:37` to assert the unset default.
  - Carry whether the model has a default on `ModelParameter` (`libs/ai/src/lib/models.ts:19-23`), as a required
    field set in `libs/assistant-react/src/lib/use-assistant-profile-selection.ts:118-130`.
  - `AIModelParameters` (`libs/ai-react/src/lib/ai-model-parameters.tsx`): when the model has no default, list a
    Default item first.
    It is selected while no level is stored (`value === ""`).
    Choosing it sends `""`, which clears the stored level.
    `onChange` (`:25`) drops falsy keys, so the item needs a non-empty sentinel key mapped to `""`.
  - New catalog key `ai.model-parameters.reasoning-effort.default`: en "Default", ru "По умолчанию"
    (`agents/I18N.md`).
  - AI-PROVIDERS.md (§Reasoning Effort):
    - models.dev gives levels, not a default.
    - When a model's rule gives no default, the picker lists Default first; it stays selected until the user picks
      a level, and choosing it clears the stored level.
    - Line 238: changing the model resets effort to the model's default, or to Default when it has none.
  - Tests:
    - a hook case in `use-assistant-profile-selection.test.tsx`: a model with levels and no default resolves an empty
      effort value;
    - a component test for `AIModelParameters`: the Default item is listed and selected for a model without a
      default, choosing it calls `onChange("reasoning_effort", "")`, and it is absent for a model with a default.
  Constraints:
  - Keep the fixed defaults of the prefix tables and the defaults OpenRouter, LM Studio, and Ollama report.
  - The run already sends `""` as "no level" (`runs/use-assistant-session.ts:36`), and the provider helpers omit it
    (`libs/ai/src/lib/chat-stream.test.ts:62`); do not change the send path.
  Done when:
  - `AI models-dev lmstudio`, `AIR ai-model-parameters`, and `AR use-assistant-profile-selection` pass;
  - the rewritten models-dev case fails against `?? values[0]`.
  Manual verify (desktop, needs an OpenAI or DeepSeek profile):
  - AI route → pick `gpt-5-mini` → the effort picker shows Default.
  - Pick `high` → pick Default again → the picker shows Default; reload → still Default.
  - Web, OpenRouter profile → a model that reports effort levels → the picker shows its reported default, with no
    Default item.
  Commit: Leave the reasoning effort unset when the catalog gives no default
  Depends on: none

- [x] 2. Make the ai-react suite pass in every file order
  Goal (P8, after item 26 rewrote the picker test):
  - `ai-chat-error.test.tsx:13-20`: drop the file-level `@koloda/core-react` mock.
    Render `AIChatError` with item 26's store wrapper, which serves hotkey settings through `queriesAtom`.
  - Replace the whole-package `@koloda/ui` mock in `ai-chat-message-status.test.tsx:12-18` with the real package.
  - Render item 1's `ai-model-parameters.test.tsx` with the same wrapper.
  - Correct the WHY at `libs/ai-react/vitest.config.mjs:17-18` to the rule that now holds.
  Constraints: `libs/ai-react` tests and config only.
  Done when:
  - `AIR` passes, with `--maxWorkers=1`, and with `--maxWorkers=1 --sequence.shuffle.files` seeds 1–5;
  - no file in the suite mocks a module a sibling renders for real (`grep -n "vi.mock" libs/ai-react/src`).
  Manual verify: none — tests only.
  Commit: Make the ai-react suite pass in every file order
  Depends on: none

- [x] 3. Fall back to the first allowlisted model
  Goal (P2):
  - `resolvedModelId` (`use-assistant-profile-selection.ts:110-114`): keep a stored model that is in the catalog.
    Otherwise take the first catalog model the selected profile's allowlist allows (unset allows all; `[]` allows
    none, which resolves to `""`).
  - A stored model the allowlist later drops still resolves (§Allowlist: it "stays visible").
  - AI-PROVIDERS.md (§Reasoning Effort, line 241): the fallback is the first model the allowlist allows.
  - Hook cases: allowlist `[B]` with nothing stored resolves `B`; `[]` resolves `""`; a stored model outside the
    allowlist but in the catalog stays.
  Constraints: the hook, its test, and that spec line.
  Done when: `AR use-assistant-profile-selection` passes.
  Manual verify (web, a profile with two or more models):
  - Settings → AI → models button → Selected → check only a model that is not first → Save → AI route → new
    conversation → the picker shows that model.
  - Save an empty selection → new conversation → no model is selected, and Send is disabled.
  Commit: Fall back to the first allowlisted model
  Depends on: none

- [x] 4. Send a cleared profile title from the edit dialog
  Goal (P3):
  - `edit-ai-profile-form.tsx:35`, `:41`: send `title: value.title`, the empty string included.
    Both hosts normalize `""` to absent: web through `optionalProfileTitleSchema` (the parse at
    `apps/web/src/app/ai.ts:126`), desktop through `normalize_optional_title` (`repo/ai.rs:243-245`).
  - The add form keeps `|| undefined`.
  - Tests: an edit case in `settings-ai-edit-profile.test.tsx` that clears the title and checks the mutation
    payload; a web `ai.test.ts` case where `title: ""` stores no title; a Rust integration case where `Some("")`
    clears it, unless one exists.
  Done when: `SR settings-ai-edit-profile`, `WEB`, and `cargo test -p koloda --test integration ai_` pass.
  Manual verify (web):
  - Settings → AI → edit a titled profile → clear the title → Save → the row shows the untitled placeholder.
  Commit: Send a cleared profile title from the edit dialog
  Depends on: none

- [x] 5. Build the model-list query in one hook
  Goal (P13):
  - Delete `useAIModels` (`libs/ai-react/src/lib/use-ai-models.ts`) and its export.
    `use-assistant-profile-selection.ts:77` reads the stored profile's state from `useAIProfilesModels`.
  - Rename `credentialId` to `profileId` in `libs/core-react/src/lib/query-keys.ts:16`.
  Constraints: no change to the query options.
  Done when: `AIR` and `AR` pass; `grep -rn "useAIModels\|credentialId" libs apps` finds nothing outside `dist/`.
  Manual verify: none — the same query with the same options.
  Commit: Build the model-list query in one hook
  Depends on: 1

- [x] 6. Refresh a profile's model list after edits and on allowlist open
  Goal (P4):
  - Edit success (`settings-ai-edit-profile.tsx:25-29`): reset `queryKeys.ai.models(profile.id)`.
    Invalidating is not enough: model queries do not refetch on mount, so a stale list would stay.
  - Delete success (`settings-ai-delete-profile.tsx:25-29`): remove that query.
  - The allowlist dialog (`settings-ai-profile-models.tsx:32`) resets the profile's list each time it opens, so it
    fetches again; its test now uses the real `useAIProfilesModels` instead of a module mock.
    `refetchOnMount: false` stays for the composer.
  - Tests in `settings-react`: edit invalidates and delete removes the models query; opening the dialog refetches.
  Done when: `SR` passes.
  Manual verify (web, an OpenRouter profile):
  - Settings → AI → edit → replace the key with a wrong one → Save → AI route → open the picker → that profile shows
    the error row.
  - Settings → AI → models button → the list shows a loading state before the models.
  Commit: Refresh a profile's model list after edits and on allowlist open
  Depends on: 5

- [x] 7. Load other profiles' model lists only while the picker is open
  Goal (P5; question 9):
  - `ai-model-profile-picker.tsx:59-60`: while the picker is closed, subscribe to the selected profile only; while
    open, to every profile.
    The selected profile still loads for submit through `use-assistant-profile-selection.ts`.
  - A picker test: closed subscribes to the selected profile; opening adds the others.
  - §Fetching already says this; no spec change.
  Done when: `AIR ai-model-profile-picker` passes.
  Manual verify (web, two profiles, one an Ollama profile with an unreachable base URL):
  - AI route with the working profile selected → no error shows anywhere.
  - Open the picker → the Ollama section loads, then shows its error row with retry.
  Commit: Load other profiles' model lists only while the picker is open
  Depends on: 2, 5

- [x] 8. Build LM Studio's URLs from the base by one rule
  Goal (P6):
  - `fetchOpenAICompatibleModels` (`openai-compatible.ts:53-55`) requests `${base}/models`, beside the SDK's
    `${base}/chat/completions`; strip a trailing slash the way the SDK does.
    OpenAI shares it with `https://api.openai.com/v1` (`openai.ts:10`), so its URL does not change.
  - The native list (`lmstudio.ts:69-71`) uses the same prefix with a trailing `/v1` replaced by `/api/v1`, or
    `/api/v1` appended when the base has no `/v1`.
  - Cases in `openai-compatible.test.ts` and `lmstudio.test.ts`: a base without `/v1`, and one with a path prefix.
  Done when: `AI openai-compatible lmstudio openai` passes.
  Manual verify (desktop or web, LM Studio running):
  - Settings → AI → add LM Studio with `http://localhost:1234/v1` → the picker lists models → a run streams.
  - Edit the base to `http://localhost:1234` → the picker shows the error row, not a working list.
  Commit: Build LM Studio's URLs from the base by one rule
  Depends on: none

- [x] 9. Show the last step's tokens in the context meter
  Goal (P7):
  - `runChatStream` (`chat-stream.ts:101-109`): return the last step's usage, not the run total.
    The WHY at `:101` names `finalStep.usage`; use the field the installed `ai` typings give for the last step.
  - Rewrite the WHY: the meter compares one request with the context window, and every step resends the
    conversation.
  - A case in the fake-model harness (`libs/ai/src/lib/assistant-tools.test.ts:28-75`): a two-step tool run whose
    steps report different usage returns the second step's.
  Done when: `AI assistant-tools chat-stream` passes; the new case fails against `result.usage`.
  Manual verify (web, a tool-capable model):
  - AI route → "list my decks" → the context meter reads close to the next plain reply's value, not about twice it.
  Commit: Show the last step's tokens in the context meter
  Depends on: none

- [x] 10. Discard settings edits on every close
  Goal (S1, S2, S11; question 10):
  - `AssistantSettings` (`ui/assistant-settings.tsx`) resets the form whenever `isOpen` turns false, not only in
    `handleOpenChange` (`:71-79`).
    Every close path then discards, including the toggle (`ui/assistant-chat.tsx:94`) and its hotkey.
  - Correct the WHY: the component and its form stay mounted for the chat's lifetime (`ui/assistant-chat.tsx:239`),
    and the toggle closes without `onOpenChange`.
  - Add a case beside the discard test (`ui/assistant-settings.test.tsx:152-173`): the host flips `isOpen` directly,
    as the toggle does.
  - ASSISTANT-SETTINGS.md line 22: drop "or the backdrop".
  - HOTKEYS.md line 125: "panel" → "modal".
  Done when: `AR assistant-settings` passes; the new case fails against the old component.
  Manual verify (web):
  - AI route → footer settings button → edit the prompt → `Mod+Shift+S` twice → the saved prompt is back, and Save
    and Reset are hidden.
  - Open settings → click the backdrop → the modal stays open.
  Commit: Discard settings edits on every close
  Depends on: none

- [x] 11. Delete unused assistant settings surface
  Goal (S8):
  - The `isDisabled` prop of `AssistantSettingsPromptEditor` and its four forwards.
  - `AssistantSettingsFormValues` (`libs/ai/src/lib/settings.ts:47`).
  - Rust `impl Default for AssistantSettings` (`crates/koloda/src/domain/settings_ai.rs:44-52`).
  - The four no-op casts (`ui/assistant-settings.tsx:39`, `:67`, `:75`; `use-assistant-runtime-config.ts:29`).
  Done when: `AR assistant-settings`, `AI settings`, `cargo test -p koloda --test domain settings_ai`, and
  `bun run typecheck` pass.
  Manual verify: none — deletions without behavior change.
  Commit: Delete unused assistant settings surface
  Depends on: 10

- [x] 12. Default the prompt source when a row has none
  Goal (S4; question 3):
  - TS: `chatPromptMode: chatPromptModeSchema.default("default")` (`settings.ts:36`).
    `resolveChatPromptMode` (`:54-59`) drops the template branch; an absent `assistant` object still resolves to
    Default.
  - Rust: `chat_prompt_mode: ChatPromptMode` with a serde default of `Default` (`settings_ai.rs:38-41`); delete the
    older-rows WHY.
  - Delete the old-row tests: `settings.test.ts:167-176`, `:178-185`, the row at `:219-224`;
    `settings_ai_tests.rs:482-499` and the omitted-mode cases in `test_assistant_chat_prompt_mode_wire` (`:510-521`).
  - Fix the comment at `settings_ai_tests.rs:392-394`: the null default refills a key that an RFC 7386 patch
    deletes.
  - ASSISTANT-SETTINGS.md: delete line 54.
  Done when: `AI settings`, `AR assistant-settings`, and `cargo test -p koloda --test domain settings_ai` pass.
  Manual verify: none — only rows saved before 2026-09-03 change, and the saved-mode paths are unit-tested.
  Commit: Default the prompt source when a row has none
  Depends on: 11

- [x] 13. Pin how the system prompt and temperature are sent
  Goal (S5):
  - One table against the fake-model harness (`assistant-tools.test.ts:28-75`, or a block in `chat-stream.test.ts`
    using the same harness).
    It asserts the system message and temperature the model receives.
    Rows: no template (built-in, trimmed); `""` (empty); `"  x {y}  "` (`"x {y}"`); no temperature (0.2).
  - One case where `chatPromptTemplate: ""` reaches `systemPromptTemplate: ""` (`runs/build-stream-request.ts:31`).
  Done when: `AI` and `AR build-stream-request` pass; the table fails with `||` at `chat-stream.ts:44` or without
  the `.trim()`.
  Manual verify: none — tests only.
  Commit: Pin how the system prompt and temperature are sent
  Depends on: 9

- [x] 14. Require secrets on every AI profile
  Goal (P14; question 4):
  - TS: `aiProfileValidation.secrets` required (`libs/ai/src/lib/settings.ts:12`); `AddAIProfileData.secrets`
    required and `whitelistModelIds` dropped (`:86-90`).
  - Rust: `AIProfile.secrets: AISecrets` (`domain/ai.rs:17`); `AddProfileData.secrets` required and
    `whitelist_model_ids` dropped (`:92-97`); `add_ai_profile` (`repo/ai.rs:161-166`) and the addon call
    (`apps/electron/src-rust/src/lib.rs:698-701`) follow.
  - Delete the absent-provider branches listed under P14, on both hosts.
    `UpdateAIProfileData.secrets` stays optional; title-only edits omit it.
  - Tests: delete `ai_integration_tests.rs:668`; update the `add_ai_profile` call sites, `ai_serde_tests.rs`, and
    web `ai.test.ts`.
  - `libs/native-ipc/src/index.ts:243` follows the type; check `apps/electron/IPC.md` for a payload description.
  Done when: `AI`, `AIR`, `AR`, `SR`, `WEB`, `cargo test -p koloda`, and `cargo check -p koloda-electron` pass.
  Manual verify (web):
  - Settings → AI → add an OpenRouter profile → it lists with its provider → edit its title → delete it.
  Commit: Require secrets on every AI profile
  Depends on: 4, 12

- [x] 15. Reject a provider change when updating an AI profile
  Goal (P9, P19, P21; question 8):
  - Both hosts reject an update whose secrets name another provider, before any write: web `updateAIProfile`
    (`apps/web/src/app/ai.ts:113-158`), desktop `update_ai_profile` (`repo/ai.rs:209-278`).
  - Add an error code beside `validation.ai-providers.profile-id.duplicate`: Rust `error_codes`
    (`crates/koloda/src/app/error.rs:111`), TS `ERROR_MESSAGES` (`libs/app/src/lib/error.ts:87`), en and ru text.
    `libs/app/src/lib/error-parity.test.ts` pins the pair.
  - Drop the provider-changed branches: web `providerChanged` (`ai.ts:139-142`); desktop `provider_changed` and its
    `remove_api_key` arm (`repo/ai.rs:256-266`).
  - Collapse the three lookups in `update_ai_profile` (`:219-235`) to one.
  - Turn `ai_integration_tests.rs:406` into a rejection test that also checks the stored profile and key are
    unchanged; add the web twin in `apps/web/src/app/ai.test.ts`.
  - AI-PROVIDERS.md (§Editing a Profile): an update that names another provider is rejected.
    Also: an optional API key, once stored, cannot be cleared through edit; deleting the profile removes it.
  Done when: `WEB`, the `libs/app` suite (same command with `libs/app`), and
  `cargo test -p koloda --test integration ai_` pass.
  Manual verify: none — the edit dialog cannot send another provider; tests cover both hosts.
  Commit: Reject a provider change when updating an AI profile
  Depends on: 14

- [x] 16. Derive web key presence from the stored secrets
  Goal (P15; question 6, default):
  - Web `toPublicProfile` (`apps/web/src/app/ai.ts:55-56`) derives `hasSecrets` from the secrets alone.
  - Drop the `default(false)` older-row fallback on both sides (`settings.ts:13-15`, `domain/ai.rs:18-21`); every
    writer sets the flag.
  - Reword the older-row WHYs to the live reason, blank or whitespace input: `domain/ai.rs:22-23`, `:30-32`;
    `repo/ai.rs:28-30`, `:110-112`, `:239`; `provider-secrets.ts:55-58`.
  Done when: `AI settings provider-secrets`, `WEB`, and `cargo test -p koloda` pass.
  Manual verify: none — web key presence already equals the stored flag (`apps/web/src/app/ai.test.ts:50`).
  Commit: Derive web key presence from the stored secrets
  Depends on: 15

- [x] 17. Show a failed profile delete in its popover
  Goal (P10):
  - `SettingsAIDeleteProfile` (`settings-ai-delete-profile.tsx:18`) reads `error` and `reset`.
    It shows the error inline in the popover, as `ai-providers/add-ai-profile-form.tsx:41` does with `db.delete`
    as the fallback, and resets on close.
  - AI-PROVIDERS.md (§Deleting a Profile): if deleting fails, the popover stays open and shows the error.
  - A component test: a failing mutation shows the error and keeps the popover open.
  Done when: `SR settings-ai-delete-profile` passes.
  Manual verify: none — failure needs a broken keyring; the component test covers it.
  Commit: Show a failed profile delete in its popover
  Depends on: 6

- [x] 18. Delete model fields nothing reads
  Goal (P11):
  - The output overlay in `models-dev.ts` (`:37-52`, `:104`) and the README clause about it.
  - `AIModel.description`, `top_provider`, `architecture`, `supported_parameters` (`models.ts:4-14`); their copying
    in `openai-compatible.ts:89-100` and in any provider that sets them.
  - The output-limit assertions (`models-dev.test.ts:145`, `:156`, `:176`).
  - Keep the `limit.context` fill.
  Done when: `AI` passes; the P11 search finds nothing.
  Manual verify: none — no reader.
  Commit: Delete model fields nothing reads
  Depends on: 8

- [x] 19. Delete an unused AI query, row flag, and type export
  Goal (P12):
  - `getAIProfileModelsQuery` from the contract (`libs/core-react/src/lib/queries.ts:108`, `queries-contract.ts:52`),
    both hosts (`apps/web/src/app/queries.ts:201`, `apps/electron-react/src/app/queries.ts:225`), and the test stub
    (`assistant-chat-integration.test.tsx:174`).
  - `SettingsModelRow.isStale` and its assertions.
  - The root `ChatStreamGenerator` export (`libs/ai/src/index.ts:17`).
    Retype the mock in `runs/use-conversation-runs.test.ts:1`, `:53` without it.
    If no exported type fits, keep the export and say so in Outcome.
  Done when: `AR`, `SR`, `AI`, and `bun run test:app-unit` pass.
  Manual verify: none — no production caller.
  Commit: Delete an unused AI query, row flag, and type export
  Depends on: none

- [x] 20. Start DeepSeek's two model requests together
  Goal (P16):
  - `fetchDeepSeekModels` (`deepseek.ts:21-31`) passes the unawaited `fetch(…).then(throwForAIResponse)` into
    `Promise.all`, as `openai.ts:13-16` does.
  - A `deepseek.test.ts` case: while `/models` is pending, the catalog request has started.
  Done when: `AI deepseek` passes.
  Manual verify: none — timing only.
  Commit: Start DeepSeek's two model requests together
  Depends on: none

- [x] 21. Table the AI keyring round-trip tests
  Goal (P17, Rust part):
  - Replace the five round-trip tests (`ai_integration_tests.rs:242`, `:276`, `:310`, `:342`, `:374`) with one
    table over the API-key-only variants.
  Done when: `cargo test -p koloda --test integration ai_` passes with one table instead of five tests.
  Manual verify: none — tests only.
  Commit: Table the AI keyring round-trip tests
  Depends on: 14

- [x] 22. Wrap web model-list errors like the desktop host
  Goal (P20):
  - Web `listModels` (`apps/web/src/app/ai-runtime.ts:69-74`) wraps `fetchModels(secrets)` in `wrapAIError`, as
    `apps/electron/src/ai-ipc.ts:181` does.
  - A `WEB` case: a failing fetch rejects with the wrapped error.
  Done when: `WEB` passes.
  Manual verify: none — the picker shows the same generic error row.
  Commit: Wrap web model-list errors like the desktop host
  Depends on: none

- [x] 23. Name the settings twins and give the TS temperature bounds their code
  Goal (S3, S9, S10):
  - The Rust doc on `ASSISTANT_TEMPERATURE_RANGE` (`settings_ai.rs:12-14`) names its TS twins instead of a provider
    list.
    Fix the module doc (`:3`): `findDuplicateProfileId` checks only ids.
  - Add `validation.assistant-settings.temperature-range` to the two bounds in `libs/ai/src/lib/settings.ts:34`,
    `:42`, with a `settings.test.ts` case.
  - ASSISTANT-SETTINGS.md: keep both temperature rules under §Temperature, with "the previous saved settings remain
    unchanged".
    Line 92 says only that an unset temperature uses the built-in default.
  - `agents/ASSISTANT-MAP.md:40`: add `libs/ai` `settings.ts`, `prompts.ts`, `chat-stream.ts`, and
    `crates/koloda/src/domain/settings_ai.rs`.
  Done when: `AI settings` and `cargo test -p koloda --test domain settings_ai` pass.
  Manual verify: none — the slider keeps values in range.
  Commit: Name the settings twins and give the TS temperature bounds their code
  Depends on: 12

- [x] 24. Test that saved settings reach runs and every discard path
  Goal (S6):
  - Test `useAssistantRuntimeConfig` with a real `QueryClient`: seed the `ai` query, read `configRef`, update the
    cache, read again.
    Cover a Custom prompt with a temperature, and an absent `assistant` object (null template, 0.2).
  - Add Discard (the Reset control) and Escape cases beside the discard test.
  - Delete the render-only tests (`ui/assistant-settings.test.tsx:86-92`, `:94-102`).
  Done when: `AR use-assistant-runtime-config assistant-settings` passes.
  Manual verify: none — tests only.
  Commit: Test that saved settings reach runs and every discard path
  Depends on: 10, 12

- [x] 25. Prove profile writes keep the assistant settings
  Goal (S7):
  - On each host, extend one profile test: seed `assistant` with all three fields, add a profile, and read them back
    field by field.
    Rust in `ai_integration_tests.rs`; web in `apps/web/src/app/ai.test.ts`.
  Done when: `WEB` and `cargo test -p koloda --test integration ai_` pass.
  Manual verify: none — tests only.
  Commit: Prove profile writes keep the assistant settings
  Depends on: 14

- [x] 26. Keep an empty-allowlist section from crashing the model picker
  Goal (P22; P17 picker part):
  - `ai-model-profile-picker.tsx`: give the empty-models row and the status row distinct React keys, so the
    listbox mounts a new item instead of changing an id in place; add a WHY.
  - Rewrite `ai-model-profile-picker.test.tsx` on real modules: drop the `@koloda/ui`, `motion/react`, and
    `./use-ai-profiles-models` mocks.
    A shared wrapper in `libs/ai-react/src/test/test-helpers.tsx` gives a real Jotai store and query client, with
    hotkey settings and an injected `listModels`.
  - Delete the four cases that re-test allowlist rules (`:78`, `:93`, `:108`, `:138`);
    `filter-profile-models.test.ts:11-75` owns them.
  - Replace the empty-allowlist case (`:123`) with a gated interleaving: open the picker while the list loads,
    then release it; the empty-models row shows.
  Done when: `AIR ai-model-profile-picker` passes; the case fails with "Cannot change the id of an item" without the
  keys.
  Manual verify (web, an OpenRouter profile):
  - Settings → AI → models button → Selected → uncheck everything → Save → reload → AI route → the composer
    renders, and the picker shows the profile with "No models".
  Commit: Keep an empty-allowlist section from crashing the model picker
  Depends on: 1

## Outcome

Shipped, one commit per Plan item:

- A model whose source gives no default reasoning level now has none.
  The effort picker lists Default first for it, and choosing Default clears a picked level, so the run sends none and
  the provider's default applies.
  The models.dev and LM Studio first-value guesses are gone.
- With no stored model, the selection falls back to the first allowlisted model; an empty allowlist selects none.
- The edit dialog sends a cleared title, and both hosts store it as absent.
- One hook builds the model-list query; the key argument is `profileId`.
- Editing a profile resets its cached model list, deleting removes it, and the allowlist dialog fetches on every open.
- The composer's picker loads other profiles' lists only while it is open.
- An empty-allowlist section no longer crashes the picker when its list arrives (item 26, entry P22).
- LM Studio's model list, native list, and chat share the base URL's path.
- The context meter reads the last step of a tool run.
- The `ai-react` suite passes in every file order, on real `@koloda/ui` and `@koloda/core-react`.
- Every close of the settings modal discards unsaved edits, the hotkey toggle included.
- A settings row without a prompt source opens as Default; the old-row inference and its tests are gone.
- Tests pin how the system prompt and temperature are sent, that saved settings reach runs, the Reset and Escape
  discard paths, and that profile writes keep the assistant settings on both hosts.
- Every AI profile has secrets on both hosts; the add-time allowlist is gone.
- Both hosts reject a provider change on update with `validation.ai-providers.provider.changed`.
- Web derives `hasSecrets` from its stored key; the `default(false)` fallbacks and older-row comments are gone.
- A failed delete shows its error in the confirmation.
- Dead surface is deleted: the output-limit overlay and four unread model fields, `getAIProfileModelsQuery`,
  `isStale`, the root `ChatStreamGenerator` export, Rust `impl Default for AssistantSettings`, and the prompt
  editor's `isDisabled`.
- DeepSeek starts its two model requests together; web wraps model-list errors as desktop does.
- The temperature range's Rust doc names its TS twins, and the TS bounds carry the range code.
- AI-PROVIDERS.md, ASSISTANT-SETTINGS.md, HOTKEYS.md, and `agents/ASSISTANT-MAP.md` match the code.

Beyond the item text:

- Item 26 was found in item 2 and committed before it; the picker test rewrite moved into it.
- Item 6 resets the cached list rather than invalidating it, because model queries do not refetch on mount.
- Item 14 replaced the add-time empty-model-id test with an update-path one, and deleted the serde test that pinned
  a public profile without secrets.
- Item 15 deleted the keyring-remove rollback test of a provider change; that path no longer exists.
- Item 19 also dropped the now-unused `aiRuntime` parameter of both hosts' `queriesFn`.
  The runs test types its mock from `createAIGenerationClient` instead of the deleted export.
- The self-review commit adds the base-URL rule to AI-PROVIDERS.md (§Fetching).

Skipped:

- P18: the desktop-only-provider rule and its per-profile warning stay; the current behavior is correct, per
  `docs/decisions/APP-ROLES.md` (question 7).

Checks on the branch:

- Scoped Vitest and `cargo test -p koloda` per item; each fix's new case failed against the old code.
- `@koloda/ai-react` passed on one worker and in shuffled file orders, seeds 1–8; `@koloda/assistant-react`
  seeds 1–4.
- `bun run check:push` passed on the tip before Archive.
- The e2e suites were not run.

Left open:

- Seen during self-review, not fixed (also on `main`): `libs/settings-react` fails under
  `--maxWorkers=1 --sequence.shuffle.files`; see Scope, Out.
- Manual verify was handed to the human: the Default effort item, the allowlist fallback and empty allowlist after a
  reload, clearing a title, lazy model lists in the picker, and closing settings with the hotkey and the backdrop.
