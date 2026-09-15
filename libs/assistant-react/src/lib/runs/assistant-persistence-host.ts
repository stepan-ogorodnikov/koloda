import type { ConversationPersistenceHost } from "@koloda/assistant";
import { createConversationPersistenceHost } from "@koloda/assistant";
import { conversationsAtom, pendingSaveByConversationAtom } from "../state/conversation-store";
import type { AssistantJotaiStore } from "./assistant-engine-instance";
import { ensureAssistantEngine } from "./assistant-engine-instance";
import { resetEngineInstanceForTests } from "./assistant-engine-instance";

export type AssistantPersistenceWriteAdapter = {
  writeConversation: (conversationId: string) => Promise<boolean>;
};

// WHY: Persistence queues outlive any single React tree. The host keeps a
// mutable write adapter slot that route hooks register while mounted and
// clear on unmount — never an escaped Effect Event.
let persistenceWriteAdapter: AssistantPersistenceWriteAdapter | null = null;

let persistenceHostInstance: ConversationPersistenceHost | null = null;

/** Whether the application-shell persistence write adapter is registered. */
export function isAssistantPersistenceWriteAdapterReady(): boolean {
  return persistenceWriteAdapter != null;
}

/**
 * Register the React-side durable-write adapter for the engine persistence host.
 * Returns an unregister that clears the slot only if this registration is current.
 */
export function registerAssistantPersistenceWriteAdapter(adapter: AssistantPersistenceWriteAdapter): () => void {
  persistenceWriteAdapter = adapter;
  return () => {
    if (persistenceWriteAdapter === adapter) persistenceWriteAdapter = null;
  };
}

/**
 * Idempotent: wires the engine-owned persistence queue map to the store's
 * dirty counters. I/O goes through the registered write adapter slot.
 */
export function ensureAssistantPersistenceHost(store: AssistantJotaiStore): ConversationPersistenceHost {
  if (!persistenceHostInstance) {
    persistenceHostInstance = createConversationPersistenceHost({
      createWrite: (conversationId) => async () => {
        if (!isAssistantPersistenceWriteAdapterReady()) {
          // WHY: the shell registers in useLayoutEffect — reject until committed so
          // the save queue retries instead of acking a skipped write.
          throw new Error("Assistant persistence write adapter is not ready");
        }
        return persistenceWriteAdapter!.writeConversation(conversationId);
      },
      isStreaming: (conversationId) => store.get(conversationsAtom)[conversationId]?.activeRunId != null,
      getInitialPending: () => store.get(pendingSaveByConversationAtom),
      subscribePendingSaves: (listener) =>
        store.sub(pendingSaveByConversationAtom, () => {
          listener(store.get(pendingSaveByConversationAtom));
        }),
    });
    ensureAssistantEngine(store).setPersistenceHost(persistenceHostInstance);
  }
  return persistenceHostInstance;
}

/** Tests only: drop the persistence host singleton and its write adapter slot. */
export function resetAssistantPersistenceHostForTests(): void {
  persistenceHostInstance = null;
  persistenceWriteAdapter = null;
}

/**
 * Tests only: dispose the engine and drop the persistence host singletons.
 * Composed here so callers reset the whole shell boundary in one call.
 */
export function resetAssistantEngineForTests(): void {
  resetEngineInstanceForTests();
  resetAssistantPersistenceHostForTests();
}
