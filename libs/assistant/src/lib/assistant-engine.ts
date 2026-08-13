import type { AIChatMode, ChatStreamRequest } from "@koloda/ai";
import type { TemplateFields } from "@koloda/srs";
import type { AssistantExecutionIdentity, ImmutableExecutionValue } from "./assistant-execution-port";
import { logAssistantStructured } from "./assistant-observability";
import type { AssistantCommand, ShutdownInput } from "./assistant-protocol";
import type { CardGenerationStreamRequest } from "./card-generation";
import type { ConversationPersistenceHost } from "./conversation-persistence-host";
import { SHUTDOWN_FLUSH_TIMEOUT_MS } from "./conversation-persistence-host";
import { createConversationRuntime } from "./conversation-runtime";
import type {
  ConversationRuntime,
  ConversationRuntimeCallbacks,
  ConversationRuntimeTransports,
} from "./conversation-runtime";
import { createRunControllerRegistry } from "./run-controller-registry";
import type { QueueCancelReason } from "./serial-queue";

export type AssistantEngineLifecycle = "running" | "closing" | "closed";

export type AssistantEngineOptions = ConversationRuntimeCallbacks & ConversationRuntimeTransports;

/**
 * Public engine surface: typed {@link dispatch} is the sole execution ingress
 * for submit, retry, cancel, and shutdown. Runtime execute methods remain
 * private implementation details.
 */
export type AssistantEngine = {
  dispatch: (command: AssistantCommand) => void | Promise<void>;
  setPersistenceHost: (host: ConversationPersistenceHost) => void;
  disposeConversation: (conversationId: string) => void;
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

/**
 * Rejected when a conversation already has an active or queued run.
 * UI disable-submit is not sufficient for same-tick or programmatic duplicates.
 */
export class AssistantDuplicateRunError extends Error {
  readonly conversationId: string;
  readonly rejectedRunId: string;
  /** Run id currently occupying the conversation, when known. */
  readonly activeOrQueuedRunId: string | null;

  constructor(conversationId: string, rejectedRunId: string, activeOrQueuedRunId: string | null = null) {
    super(
      activeOrQueuedRunId
        ? `Conversation ${conversationId} already has an active or queued run (${activeOrQueuedRunId})`
        : `Conversation ${conversationId} already has an active or queued run`,
    );
    this.name = "AssistantDuplicateRunError";
    this.conversationId = conversationId;
    this.rejectedRunId = rejectedRunId;
    this.activeOrQueuedRunId = activeOrQueuedRunId;
  }
}

function captureExecutionValue<T>(value: ImmutableExecutionValue<T>): T {
  // WHY: Queue closures must retain command-time data, not references that a
  // later React render or mutable store update can rewrite before execution.
  return structuredClone(value) as T;
}

export function createAssistantEngine(options: AssistantEngineOptions): AssistantEngine {
  const controllerRegistry = createRunControllerRegistry();
  const runtimes = new Map<string, ConversationRuntime>();
  let persistenceHost: ConversationPersistenceHost | null = null;
  let lifecycle: AssistantEngineLifecycle = "running";
  // WHY: Unload (`pagehide`) and Electron IPC can both request shutdown. Returning
  // early while `closing` would let IPC ack before the joined flush finishes.
  let shutdownPromise: Promise<void> | null = null;

  const assertRunning = () => {
    // WHY: Reject-before-start must throw synchronously so UI can apply
    // submitTurn only after dispatch has accepted the command.
    if (lifecycle !== "running") throw new AssistantEngineClosedError(lifecycle);
  };

  const getRuntime = (conversationId: string): ConversationRuntime => {
    let runtime = runtimes.get(conversationId);
    if (!runtime) {
      assertRunning();
      runtime = createConversationRuntime(conversationId, options, options, controllerRegistry);
      runtimes.set(conversationId, runtime);
    }
    return runtime;
  };

  const closeRuntimes = (reason: QueueCancelReason) => {
    for (const runtime of runtimes.values()) {
      runtime.close(reason);
    }
  };

  const logCommand = (commandOrEvent: string, conversationId: string, runId: string) => {
    logAssistantStructured({ conversationId, runId, commandOrEvent });
  };

  const executeChatRun = (
    conversationId: string,
    runId: string,
    request: ImmutableExecutionValue<ChatStreamRequest>,
    execution: AssistantExecutionIdentity,
  ): Promise<void> => {
    assertRunning();
    logCommand("executeChat", conversationId, runId);
    return getRuntime(conversationId).executeChatRun(
      runId,
      captureExecutionValue<ChatStreamRequest>(request),
      captureExecutionValue(execution),
    );
  };

  const executeGenerateRun = (
    conversationId: string,
    runId: string,
    request: ImmutableExecutionValue<CardGenerationStreamRequest>,
    execution: AssistantExecutionIdentity,
  ): Promise<void> => {
    assertRunning();
    logCommand("executeGenerate", conversationId, runId);
    return getRuntime(conversationId).executeGenerateRun(
      runId,
      captureExecutionValue<CardGenerationStreamRequest>(request),
      captureExecutionValue(execution),
    );
  };

  const retryRun = (
    conversationId: string,
    runId: string,
    request: ImmutableExecutionValue<ChatStreamRequest | CardGenerationStreamRequest>,
    templateFields: ImmutableExecutionValue<TemplateFields> | null,
    mode: AIChatMode,
    modelName: string | undefined,
    execution: AssistantExecutionIdentity,
  ): Promise<void> => {
    assertRunning();
    // WHY: conversationId is caller-supplied — never inferred from UI-current
    // state, or a queued retry for A can restart/clear B after a switch.
    logCommand("retry", conversationId, runId);
    return getRuntime(conversationId).retryRun(
      runId,
      captureExecutionValue<ChatStreamRequest | CardGenerationStreamRequest>(request),
      templateFields ? captureExecutionValue<TemplateFields>(templateFields) : null,
      mode,
      modelName,
      captureExecutionValue(execution),
    );
  };

  const cancel = (conversationId: string, runId: string): void => {
    // WHY: Cancel remains allowed while closing so in-flight UI cancel can
    // still abort; once closed there is nothing left to cancel.
    if (lifecycle === "closed") return;
    logCommand("cancel", conversationId, runId);
    const runtime = runtimes.get(conversationId);
    if (runtime) {
      runtime.cancel(runId, "user");
      return;
    }
    controllerRegistry.cancel(runId, "user");
  };

  const shutdownGracefully = (shutdownOptions: ShutdownInput): Promise<void> => {
    // INVARIANT: Concurrent callers (browser unload + Electron IPC ack path)
    // must share one promise so acknowledgement waits for the joined flush.
    if (shutdownPromise) return shutdownPromise;
    // WHY: `dispose()` can close without going through shutdown — do not start
    // a second teardown after the engine is already sealed.
    if (lifecycle !== "running") return Promise.resolve();

    const { interruptActiveRuns, flushTimeoutMs = SHUTDOWN_FLUSH_TIMEOUT_MS } = shutdownOptions;
    shutdownPromise = (async () => {
      lifecycle = "closing";
      logAssistantStructured({
        conversationId: "*",
        commandOrEvent: "shutdown",
        priorStatus: "running",
        nextStatus: "closing",
      });

      // 1–2. Reject new commands (lifecycle) and cancel queued work with provenance.
      closeRuntimes("app_shutdown");
      // 3. Transition active (and any still-streaming queued) runs.
      interruptActiveRuns();
      // 4. Abort active controllers with shutdown provenance and seal beginRun.
      controllerRegistry.dispose("app_shutdown");
      // 5. Flush persistence.
      if (persistenceHost) await persistenceHost.flushAllBounded(flushTimeoutMs);
      // 6. Closed — beginRun already sealed by registry dispose.
      lifecycle = "closed";
      runtimes.clear();
    })();
    return shutdownPromise;
  };

  const engine: AssistantEngine = {
    get lifecycle() {
      return lifecycle;
    },

    dispatch(command) {
      switch (command.type) {
        case "submit":
          if (command.input.kind === "chat") {
            return executeChatRun(
              command.conversationId,
              command.input.runId,
              command.input.request,
              command.input.execution,
            );
          }
          return executeGenerateRun(
            command.conversationId,
            command.input.runId,
            command.input.request,
            command.input.execution,
          );
        case "retry":
          return retryRun(
            command.conversationId,
            command.input.runId,
            command.input.request,
            command.input.templateFields,
            command.input.mode,
            command.input.modelName,
            command.input.execution,
          );
        case "cancel":
          return cancel(command.conversationId, command.runId);
        case "shutdown":
          return shutdownGracefully(command.input);
      }
    },

    setPersistenceHost(host) {
      if (lifecycle === "closed") return;
      persistenceHost = host;
    },
    disposeConversation(conversationId) {
      if (lifecycle === "closed") return;
      const runtime = runtimes.get(conversationId);
      if (!runtime) return;
      logAssistantStructured({
        conversationId,
        commandOrEvent: "disposeConversation",
      });
      // WHY: close only drops queued serial-queue tasks; cancel each known run
      // so an in-flight AbortController aborts before we drop the runtime (#8).
      const state = options.readConversationState(conversationId);
      for (const runId of Object.keys(state.runs)) {
        runtime.cancel(runId, "dispose");
      }
      runtime.close("dispose");
      runtimes.delete(conversationId);
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
