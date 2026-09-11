import type { ModelParameter } from "@koloda/ai";
import type { ConversationReducerState, RevertState, RunIdPayload } from "./conversation-types";
import { getMessageRunId } from "./assistant-messages";

type SetAIProfilePayload = {
  profileId: string | null;
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

// WHY: `setAIProfile` resets profileId + model + params; `setAIModel` writes
// model + params while preserving the existing profileId. The two action
// names/payloads stay separate (the preserve-vs-reset distinction is
// load-bearing for the profile→model dependency) but share this assignment
// helper so the `modelParameters ?? {}` defaulting logic lives in one place.
type ApplyAIConfigOptions = {
  profileId?: string | null;
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

function applyAIConfig(draft: ConversationReducerState, config: ApplyAIConfigOptions) {
  if (config.profileId !== undefined) draft.profileId = config.profileId;
  draft.modelId = config.modelId;
  draft.modelParameters = config.modelParameters ?? {};
}

export function setAIProfile(draft: ConversationReducerState, payload: SetAIProfilePayload) {
  applyAIConfig(draft, payload);
}

type SetAIModelPayload = {
  modelId: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

export function setAIModel(draft: ConversationReducerState, payload: SetAIModelPayload) {
  applyAIConfig(draft, payload);
}

type SetAIModelParameterPayload = { paramType: ModelParameter["type"]; value: string | null };

export function setAIModelParameter(draft: ConversationReducerState, payload: SetAIModelParameterPayload) {
  if (payload.value === null || payload.value === "") {
    delete draft.modelParameters[payload.paramType];
  } else {
    draft.modelParameters[payload.paramType] = payload.value;
  }
}

export function dismissRunError(draft: ConversationReducerState, payload: RunIdPayload) {
  draft.dismissedRunErrorId = payload.runId;
}

export function markRead(draft: ConversationReducerState, payload: RunIdPayload) {
  if (!draft.runs[payload.runId]) return;
  if (draft.lastReadRunId === payload.runId) return;
  draft.lastReadRunId = payload.runId;
}

type NewConversationPayload = {
  id: string;
  createdAt: Date;
  profileId?: string | null;
  modelId?: string | null;
  modelParameters?: Partial<Record<ModelParameter["type"], string>>;
};

export function newConversation(draft: ConversationReducerState, payload: NewConversationPayload) {
  draft.id = payload.id;
  draft.createdAt = payload.createdAt;
  // INVARIANT: Create stamps updatedAt once, equal to createdAt. Later prompt
  // and title edits must not bump it; the next bump is a submitted run.
  draft.updatedAt = payload.createdAt;
  draft.messages = [];
  draft.runs = {};
  draft.activeRunId = null;
  draft.dismissedRunErrorId = null;
  draft.profileId = payload.profileId ?? null;
  draft.modelId = payload.modelId ?? null;
  draft.modelParameters = payload.modelParameters ?? {};
  draft.lastReadRunId = null;
  draft.promptInput = "";
  draft.revertState = null;
}

export function setPromptInput(draft: ConversationReducerState, payload: string) {
  if (draft.promptInput === payload) return;
  draft.promptInput = payload;
}

// WHY: The payload is the revert state itself (not a wrapper object) so
// `["setRevertState", null]` reads as "clear revert" — same call site as
// `["setRevertState", someRevertState]` reads as "set revert to this".
export function setRevertState(draft: ConversationReducerState, payload: RevertState | null) {
  if (draft.revertState === payload) return;
  draft.revertState = payload;
}

export function commitRevert(draft: ConversationReducerState) {
  if (!draft.revertState) return;
  const { revertedToUserMessageId } = draft.revertState;
  const userMessageIndex = draft.messages.findIndex((m) => m.id === revertedToUserMessageId);
  if (userMessageIndex === -1) {
    // WHY: Stale revert state (target message was removed by some
    // other path). Clear the revert state so the UI stops hiding
    // nothing; nothing actually needs deleting.
    draft.revertState = null;
    return;
  }

  draft.messages = draft.messages.slice(0, userMessageIndex);

  const survivingRunIds = new Set<string>();
  for (const m of draft.messages) {
    const runId = getMessageRunId(m);
    if (runId) survivingRunIds.add(runId);
  }
  for (const id of Object.keys(draft.runs)) {
    if (!survivingRunIds.has(id)) delete draft.runs[id];
  }

  if (draft.lastReadRunId !== null && !(draft.lastReadRunId in draft.runs)) {
    draft.lastReadRunId = null;
  }
  draft.activeRunId = null;
  draft.dismissedRunErrorId = null;
  draft.revertState = null;
}
