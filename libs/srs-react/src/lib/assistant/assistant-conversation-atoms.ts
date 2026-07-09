/**
 * Conversation atoms barrel — re-exports the split modules for stable import paths.
 *
 * - conversation-store.ts: conversations + current id + dispatch + pending save
 * - conversation-selectors.ts: derived UI atoms (messages/runs/locked/unread)
 * - conversation-actions.ts: setMode/deck/profile/new/clone/remove
 */
export type { SaveStatus, ConversationStore } from "./conversation-store";
export {
  conversationsAtom,
  assistantConversationStateAtom,
  dispatchToConversation,
  dispatchToConversationOnStore,
  saveStatusAtom,
  dismissSaveStatusAtom,
  pendingSaveAtom,
  bumpPendingSaveAtom,
  setCurrentConversationIdAtom,
  upsertConversationAtom,
} from "./conversation-store";

export {
  assistantErroredRunAtom,
  assistantMessagesAtom,
  assistantRevertStateAtom,
  assistantRunsAtom,
  assistantActiveRunIdAtom,
  assistantModeAtom,
  assistantDeckIdAtom,
  assistantEffectiveModeAtom,
  assistantProfileIdAtom,
  assistantAIModelIdAtom,
  assistantAIModelParametersAtom,
  assistantIsProcessingAtom,
  assistantHasContextAtom,
  assistantConversationHasContextAtom,
  assistantIsLockedAtom,
  assistantContextUsageAtom,
  unreadConversationIdsAtom,
} from "./conversation-selectors";

export type { NewConversationPayload, CloneConversationPayload } from "./conversation-actions";
export {
  removeConversationAtom,
  setAssistantModeAtom,
  setAssistantDeckAtom,
  setAssistantAIProfileAtom,
  setAssistantAIModelAtom,
  setAssistantAIModelParameterAtom,
  newConversationAtom,
  setAssistantCardStatusAtom,
  cloneConversationAtom,
} from "./conversation-actions";
