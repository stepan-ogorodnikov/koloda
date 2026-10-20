import type { ModelParameter } from "@koloda/ai";
import type { AIProfileState, AIProfileStateUpdater } from "./ai-profile-state";

/**
 * Dual-write / last-used shapes for AI profile state.
 * Conversation reducer fields and the global localStorage record stay separate
 * stores (see ASSISTANT-CONVERSATIONS.md §AI Profile State); this module
 * owns the payloads that keep them in sync.
 */

export function lastUsedOnRunStart(profileId: string, modelId: string): AIProfileStateUpdater {
  // WHY: Omit modelParameters — `useSetGlobalAIProfileState` patches entry-wise,
  // so an omitted (or empty) map leaves stored params alone. Submit/retry must
  // not clear params the picker already wrote (ASSISTANT-CONVERSATIONS.md
  // §AI Profile State — global updates on run start).
  return { profileId, modelId };
}

// INVARIANT: Profile and model changes return the whole global record so the
// caller replaces it. Merged into the stored record, the empty map would keep
// the old model's parameters (ASSISTANT-CONVERSATIONS.md §AI Profile State).
export function profileChangeSync(profileId: string, modelId: string) {
  return {
    conversation: { profileId, modelId, modelParameters: {} as const },
    global: { profileId, modelId, modelParameters: {} } satisfies AIProfileState,
  };
}

export function modelChangeSync(profileId: string | null, modelId: string) {
  return {
    conversation: { modelId, modelParameters: {} as const },
    global: { profileId, modelId, modelParameters: {} } satisfies AIProfileState,
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
