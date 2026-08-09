import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { AssistantCommand } from "./assistant-protocol";
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
import type { QueueCancelReason } from "./serial-queue";

export type AssistantEngineLifecycle = "running" | "closing" | "closed";

export type AssistantEngineOptions = ConversationRuntimeCallbacks & ConversationRuntimeTransports;

export type AssistantEngineShutdownOptions = {
  /** Transition in-flight runs to `interrupted`/`app_shutdown` before aborting streams. */
  interruptActiveRuns: () => void;
  flushTimeoutMs?: number;
};

export type AssistantEngine = {
  dispatch: (command: AssistantCommand) => void | Promise<void>;
  armPendingRun: (mode: AIChatMode, runId: string) => void;
  executeChatRun: (conversationId: string, runId: string, request: ChatStreamRequest) => Promise<void>;
  executeGenerateRun: (conversationId: string, runId: string, request: CardGenerationStreamRequest) => Promise<void>;
  retryRun: (
    conversationId: string,
    runId: string,
    request: ChatStreamRequest | CardGenerationStreamRequest,
    templateFields: TemplateFields | null,
    mode: AIChatMode,
    modelName?: string,
  ) => Promise<void>;
  cancel: (conversationId: string, runId: string) => void;
  setPersistenceHost: (host: ConversationPersistenceHost) => void;
  disposeConversation: (conversationId: string) => void;
  shutdownGracefully: (options: AssistantEngineShutdownOptions) => Promise<void>;
  dispose: () => void;
  readonly lifecycle: AssistantEngineLifecycle;
};

export class AssistantEngineClosedError extends Error {
  readonly lifecycle: AssistantEngineLifecycle;

  constructor(lifecycle: AssistantEngineLifecycle) {
    super(`AssistantEngine is ${lifecycle}`);
    this.name = "AssistantEngineClosedError";
    this.lifecycle = lifecycle;
  }
}

export function createAssistantEngine(options: AssistantEngineOptions): AssistantEngine {
  const controllerRegistry = createRunControllerRegistry();
  const pendingRunRefs = createPendingRunRefs();
  const runtimes = new Map<string, ConversationRuntime>();
  let persistenceHost: ConversationPersistenceHost | null = null;
  let lifecycle: AssistantEngineLifecycle = "running";

  const assertRunning = () => {
    if (lifecycle !== "running") {
      throw new AssistantEngineClosedError(lifecycle);
    }
  };

  const getRuntime = (conversationId: string): ConversationRuntime => {
    let runtime = runtimes.get(conversationId);
    if (!runtime) {
      assertRunning();
      runtime = createConversationRuntime(conversationId, options, options, controllerRegistry, pendingRunRefs);
      runtimes.set(conversationId, runtime);
    }
    return runtime;
  };

  const closeRuntimes = (reason: QueueCancelReason) => {
    for (const runtime of runtimes.values()) {
      runtime.close(reason);
    }
  };

  const engine: AssistantEngine = {
    get lifecycle() {
      return lifecycle;
    },

    dispatch(command) {
      switch (command.type) {
        case "armPendingRun":
          return engine.armPendingRun(command.mode, command.runId);
        case "executeChat":
          return engine.executeChatRun(command.conversationId, command.input.runId, command.input.request);
        case "executeGenerate":
          return engine.executeGenerateRun(command.conversationId, command.input.runId, command.input.request);
        case "retry":
          return engine.retryRun(
            command.conversationId,
            command.input.runId,
            command.input.request,
            command.input.templateFields,
            command.input.mode,
            command.input.modelName,
          );
        case "cancel":
          return engine.cancel(command.conversationId, command.runId);
      }
    },

    armPendingRun(mode, runId) {
      assertRunning();
      pendingRunRefs.arm(mode, runId);
    },
    executeChatRun(conversationId, runId, request) {
      if (lifecycle !== "running") {
        return Promise.reject(new AssistantEngineClosedError(lifecycle));
      }
      return getRuntime(conversationId).executeChatRun(runId, request);
    },
    executeGenerateRun(conversationId, runId, request) {
      if (lifecycle !== "running") {
        return Promise.reject(new AssistantEngineClosedError(lifecycle));
      }
      return getRuntime(conversationId).executeGenerateRun(runId, request);
    },
    retryRun(conversationId, runId, request, templateFields, mode, modelName) {
      if (lifecycle !== "running") {
        return Promise.reject(new AssistantEngineClosedError(lifecycle));
      }
      // WHY: conversationId is caller-supplied — never inferred from UI-current
      // state, or a queued retry for A can restart/clear B after a switch.
      return getRuntime(conversationId).retryRun(runId, request, templateFields, mode, modelName);
    },
    cancel(conversationId, runId) {
      // WHY: Cancel remains allowed while closing so in-flight UI cancel can
      // still abort; once closed there is nothing left to cancel.
      if (lifecycle === "closed") return;
      const runtime = runtimes.get(conversationId);
      if (runtime) {
        runtime.cancel(runId, "user");
        return;
      }
      controllerRegistry.cancel(runId, "user");
    },
    setPersistenceHost(host) {
      if (lifecycle === "closed") return;
      persistenceHost = host;
    },
    disposeConversation(conversationId) {
      if (lifecycle === "closed") return;
      const runtime = runtimes.get(conversationId);
      if (!runtime) return;
      // WHY: close only drops queued serial-queue tasks; cancel each known run
      // so an in-flight AbortController aborts before we drop the runtime (#8).
      const state = options.readConversationState(conversationId);
      for (const runId of Object.keys(state.runs)) {
        runtime.cancel(runId, "dispose");
      }
      runtime.close("dispose");
      runtimes.delete(conversationId);
    },
    async shutdownGracefully({ interruptActiveRuns, flushTimeoutMs = SHUTDOWN_FLUSH_TIMEOUT_MS }) {
      if (lifecycle !== "running") return;
      lifecycle = "closing";

      // 1–2. Reject new commands (lifecycle) and cancel queued work with provenance.
      closeRuntimes("app_shutdown");
      // 3. Transition active (and any still-streaming queued) runs.
      interruptActiveRuns();
      // 4. Abort active controllers with shutdown provenance and seal beginRun.
      controllerRegistry.dispose("app_shutdown");
      // 5. Flush persistence.
      if (persistenceHost) {
        await persistenceHost.flushAllBounded(flushTimeoutMs);
      }
      // 6. Closed — beginRun already sealed by registry dispose.
      lifecycle = "closed";
      runtimes.clear();
    },
    dispose() {
      // INVARIANT: Mirror shutdown — ignore re-entry while closing so a dispose
      // during flushAllBounded cannot tear down the persistence host mid-flush.
      if (lifecycle !== "running") return;
      lifecycle = "closing";
      closeRuntimes("dispose");
      controllerRegistry.dispose("dispose");
      persistenceHost?.dispose();
      persistenceHost = null;
      runtimes.clear();
      lifecycle = "closed";
    },
  };

  return engine;
}
