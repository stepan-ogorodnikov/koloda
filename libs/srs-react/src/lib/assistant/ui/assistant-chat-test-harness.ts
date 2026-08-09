import { useAssistantProfileSelection } from "../use-assistant-profile-selection";
import { useAssistantEngineHost } from "../runs/use-assistant-engine-host";
import { useAssistantSession } from "../runs/use-assistant-session";
import { useConversationPersistence } from "../persistence/use-conversation-persistence";
import { useConversationSaveHost } from "../persistence/use-conversation-save-host";

export type UseAssistantChatTestHarnessOptions = {
  conversationId: string | undefined;
  onConversationIdChange: (id: string) => void;
};

/**
 * Application-shell hosts (mirrors `App` in `@koloda/app-react`). Mount above
 * chat so AI-route unmount does not drop shutdown listeners or the write adapter.
 */
export function useAssistantAppShellHosts(): void {
  useConversationSaveHost();
  useAssistantEngineHost();
}

/**
 * Chat-tree facades only (mirrors `AssistantChat` on the AI route). Does not
 * mount engine/persistence hosts — pair with `useAssistantAppShellHosts` when
 * simulating shell vs route lifetime.
 */
export function useAssistantChatSessionHarness({
  conversationId,
  onConversationIdChange,
}: UseAssistantChatTestHarnessOptions) {
  const { profileId, modelId, modelName, modelParameters } = useAssistantProfileSelection();

  // Mounted for restore / save-error dismiss coverage even when the suite
  // only drives RunController.
  useConversationPersistence({ conversationId });

  const { controller } = useAssistantSession({
    conversationId,
    onConversationIdChange,
    profileId,
    modelId,
    modelName,
    modelParameters,
  });

  return { profileId, controller };
}

/**
 * Test-only stack of the same facades `App` + AI route + `AssistantChat` compose.
 * Not a public API — do not export from the package or use in production UI.
 */
export function useAssistantChatTestHarness({
  conversationId,
  onConversationIdChange,
}: UseAssistantChatTestHarnessOptions) {
  useAssistantAppShellHosts();

  return useAssistantChatSessionHarness({ conversationId, onConversationIdChange });
}
