import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { CardGenerationStreamRequest } from "./card-generation";
import type { ConversationPersistenceHost } from "./conversation-persistence-host";
import { SHUTDOWN_FLUSH_TIMEOUT_MS } from "./conversation-persistence-host";
import { createConversationRuntime } from "./conversation-runtime";
import type {
  ConversationRuntime,
  ConversationRuntimeCallbacks,
  ConversationRuntimeTransports,
} from "./conversation-runtime";
import { createPendingRunRefs } from "./pending-run-refs";
import { createRunControllerRegistry } from "./run-controller-registry";

export type AssistantEngineOptions<TAction> = ConversationRuntimeCallbacks<TAction> & ConversationRuntimeTransports;

export type AssistantEngineShutdownOptions = {
  /** Transition in-flight runs to `interrupted`/`app_shutdown` before aborting streams. */
  interruptActiveRuns: () => void;
  flushTimeoutMs?: number;
};

export type AssistantEngine<TAction> = {
  armPendingRun: (mode: AIChatMode, runId: string) => void;
  executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) => Promise<void>;
  executeGenerateRun: (conversationId: string, runId: string, request: CardGenerationStreamRequest) => Promise<void>;
  retryRun: (
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
  cancel: (runId: string) => void;
  setPersistenceHost: (host: ConversationPersistenceHost) => void;
  shutdownGracefully: (options: AssistantEngineShutdownOptions) => Promise<void>;
  dispose: () => void;
};

export function createAssistantEngine<TAction>(options: AssistantEngineOptions<TAction>): AssistantEngine<TAction> {
  const controllerRegistry = createRunControllerRegistry();
  const pendingRunRefs = createPendingRunRefs();
  const runtimes = new Map<string, ConversationRuntime<TAction>>();
  let persistenceHost: ConversationPersistenceHost | null = null;

  const getRuntime = (conversationId: string): ConversationRuntime<TAction> => {
    let runtime = runtimes.get(conversationId);
    if (!runtime) {
      runtime = createConversationRuntime(conversationId, options, options, controllerRegistry, pendingRunRefs);
      runtimes.set(conversationId, runtime);
    }
    return runtime;
  };

  return {
    armPendingRun: pendingRunRefs.arm,
    executeChatRun(conversationId, runId, request) {
      return getRuntime(conversationId).executeChatRun(runId, request);
    },
    executeGenerateRun(conversationId, runId, request) {
      return getRuntime(conversationId).executeGenerateRun(runId, request);
    },
    retryRun(runId, request, templateFields, mode, modelName) {
      const conversationId = options.readState().id;
      return getRuntime(conversationId).retryRun(runId, request, templateFields, mode, modelName);
    },
    cancel(runId) {
      controllerRegistry.cancel(runId);
    },
    setPersistenceHost(host) {
      persistenceHost = host;
    },
    async shutdownGracefully({ interruptActiveRuns, flushTimeoutMs = SHUTDOWN_FLUSH_TIMEOUT_MS }) {
      // WHY: interrupt before abort so reducer lands on `interrupted`/`app_shutdown`
      // instead of the transport's user-cancel path (`canceled`/`user`).
      interruptActiveRuns();
      controllerRegistry.dispose();
      if (persistenceHost) {
        await persistenceHost.flushAllBounded(flushTimeoutMs);
      }
    },
    dispose() {
      controllerRegistry.dispose();
      persistenceHost?.dispose();
      persistenceHost = null;
      runtimes.clear();
    },
  };
}
