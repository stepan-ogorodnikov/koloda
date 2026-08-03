import type { ModelParameter } from "@koloda/ai";
import type { AIProfileStateUpdater } from "./ai-profile-state";

/**
 * Dual-write / last-used shapes for AI profile state.
 * Conversation reducer fields and the global localStorage record stay separate
 * stores (see ASSISTANT-CHAT-CONVERSATIONS.md §AI Profile State); this module
 * owns the payloads that keep them in sync.
 */

export function lastUsedOnRunStart(profileId: string, modelId: string): AIProfileStateUpdater {
  // WHY: Omit modelParameters — `useSetGlobalAIProfileState` patches entry-wise,
  // so an omitted (or empty) map leaves stored params alone. Submit/retry must
  // not clear params the picker already wrote (ASSISTANT-CHAT-CONVERSATIONS.md
  // §AI Profile State — global updates on run start).
  return { profileId, modelId };
}

export function profileChangeSync(profileId: string, modelId: string) {
  return {
    conversation: { profileId, modelId, modelParameters: {} as const },
    global: { profileId, modelId, modelParameters: {} } satisfies AIProfileStateUpdater,
  };
}

export function modelChangeSync(profileId: string | null, modelId: string) {
  return {
    conversation: { modelId, modelParameters: {} as const },
    global: { profileId, modelId, modelParameters: {} } satisfies AIProfileStateUpdater,
  };
}

export function parameterChangeSync(
  profileId: string | null,
  modelId: string | null,
  type: ModelParameter["type"],
  value: string | null,
) {
  return {
    conversation: { paramType: type, value },
    global: {
      profileId,
      modelId,
      modelParameters: { [type]: value ?? "" },
    } satisfies AIProfileStateUpdater,
  };
}
