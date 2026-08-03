import { useAssistantProfileSelection } from "../use-assistant-profile-selection";
import { useAssistantSession } from "../runs/use-assistant-session";
import { useConversationPersistence } from "../persistence/use-conversation-persistence";

export type UseAssistantChatTestHarnessOptions = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
};

/**
 * Test-only stack of the same facades `AssistantChat` composes.
 * Not a public API — do not export from the package or use in production UI.
 */
export function useAssistantChatTestHarness({
  conversationId,
  onConversationIdChange,
}: UseAssistantChatTestHarnessOptions) {
  const { profileId, modelId, modelName, modelParameters, selectedProfile } = useAssistantProfileSelection();

  // Mounted for save / pagehide / unmount coverage even when the suite
  // only drives RunController.
  useConversationPersistence({ conversationId });

  const { controller } = useAssistantSession({
    conversationId,
    onConversationIdChange,
    profileId,
    modelId,
    modelName,
    modelParameters,
    selectedProfile,
  });

  return { profileId, controller };
}
