import type { AIChatMode, ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAssistantEngine } from "./assistant-engine";
import type { AssistantExecutionPort, AssistantGenerateExecutionInput } from "./assistant-execution-port";
import type { AssistantEvent } from "./assistant-protocol";
import type { CardGenerationExecutor, CardGenerationStreamRequest } from "./card-generation";

type ConversationStateSnapshot = { runs: Record<string, { mode?: AIChatMode }> };

function holdUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

describe("createAssistantEngine", () => {
  const events: AssistantEvent[] = [];
  const conversationStates: Record<string, ConversationStateSnapshot> = {};
  let chatStreamGenerator: ReturnType<typeof vi.fn<ChatStreamGenerator>>;
  let streamGenerator: ReturnType<typeof vi.fn<CardGenerationExecutor>>;
  let engine: ReturnType<typeof createAssistantEngine>;
  let readConversationState: ReturnType<typeof vi.fn<(conversationId: string) => ConversationStateSnapshot>>;

  beforeEach(() => {
    events.length = 0;
    for (const key of Object.keys(conversationStates)) delete conversationStates[key];
    chatStreamGenerator = vi.fn<ChatStreamGenerator>();
    streamGenerator = vi.fn<CardGenerationExecutor>();
    readConversationState = vi.fn<(conversationId: string) => ConversationStateSnapshot>(
      (conversationId) => conversationStates[conversationId] ?? { runs: {} },
    );

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      emit: (event) => {
        events.push(event);
      },
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      isRunStreaming: () => true,
      readConversationState,
    });
  });

  it("cancel(conversationId, runId) aborts only the targeted run", async () => {
    const signals: AbortSignal[] = [];

    chatStreamGenerator.mockImplementation(async (_req, _onChunk, signal) => {
      signals.push(signal);
      await holdUntilAborted(signal);
      return undefined;
    });

    const runA = engine.executeChatRun("conv-a", "run-a", {} as ChatStreamRequest);
    const runB = engine.executeChatRun("conv-b", "run-b", {} as ChatStreamRequest);

    await Promise.resolve();
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(false);
    expect(signals[1]?.aborted).toBe(false);

    engine.cancel("conv-a", "run-a");
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    await expect(runA).resolves.toBeUndefined();

    engine.cancel("conv-b", "run-b");
    await expect(runB).resolves.toBeUndefined();
  });

  it("does not abort in-flight runs when dispose is not called", async () => {
    let resolveStream!: () => void;
    chatStreamGenerator.mockImplementation(async (_req, onChunk) => {
      onChunk("chunk");
      await new Promise<void>((resolve) => {
        resolveStream = resolve;
      });
      return undefined;
    });

    const runPromise = engine.executeChatRun("conv-a", "run-1", {} as ChatStreamRequest);
    await Promise.resolve();

    resolveStream();
    await runPromise;

    const updates = events.filter((e) => e.type === "runChunk" && e.chunk.kind === "assistantText");
    expect(updates.some((e) => e.conversationId === "conv-a")).toBe(true);
  });

  it("shutdownGracefully interrupts active runs before aborting controllers", async () => {
    const signals: AbortSignal[] = [];
    const interrupted: string[] = [];

    chatStreamGenerator.mockImplementation(async (_req, _onChunk, signal) => {
      signals.push(signal);
      await holdUntilAborted(signal);
      return undefined;
    });

    const runPromise = engine.executeChatRun("conv-a", "run-1", {} as ChatStreamRequest);
    await Promise.resolve();
    expect(signals[0]?.aborted).toBe(false);

    await engine.shutdownGracefully({
      interruptActiveRuns: () => {
        interrupted.push("run-1");
      },
      flushTimeoutMs: 0,
    });

    expect(interrupted).toEqual(["run-1"]);
    expect(signals[0]?.aborted).toBe(true);
    await expect(runPromise).resolves.toBeUndefined();
  });

  it("queued retry for A stays owned by A after UI-current switches to B", async () => {
    conversationStates["A"] = { runs: { "run-a": { mode: "chat" } } };
    conversationStates["B"] = { runs: {} };

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let retryStarted = false;

    chatStreamGenerator.mockImplementation(async (_req, onChunk) => {
      if (!retryStarted) {
        await firstGate;
        return undefined;
      }
      onChunk("retried");
      return undefined;
    });

    const firstRun = engine.executeChatRun("A", "run-blocker", {} as ChatStreamRequest);
    await Promise.resolve();

    const retryPromise = engine.retryRun("A", "run-a", {} as ChatStreamRequest, null, "chat", "model-a");
    await Promise.resolve();

    // Simulate the UI switching to B while A's retry is still queued.
    conversationStates["B"] = { runs: { "run-b": { mode: "chat" } } };

    retryStarted = true;
    releaseFirst();
    await firstRun;
    await retryPromise;

    const restartActions = events.filter((e) => e.type === "runStarted");
    expect(restartActions).toHaveLength(1);
    expect(restartActions[0]?.conversationId).toBe("A");

    const clearActions = events.filter(
      (e) => e.type === "runChunk" && e.chunk.kind === "assistantText" && e.chunk.text === "",
    );
    expect(clearActions.some((e) => e.conversationId === "A")).toBe(true);
    expect(clearActions.some((e) => e.conversationId === "B")).toBe(false);

    const chunkUpdates = events.filter(
      (e) => e.type === "runChunk" && e.chunk.kind === "assistantText" && e.chunk.text === "retried",
    );
    expect(chunkUpdates).toHaveLength(1);
    expect(chunkUpdates[0]?.conversationId).toBe("A");

    expect(readConversationState).toHaveBeenCalledWith("A");
    expect(events.some((e) => e.conversationId === "B")).toBe(false);
  });

  it("captures immutable command input before queued execution reaches the application port", async () => {
    let releaseBlocker!: () => void;
    const blockerGate = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const generateInputs: AssistantGenerateExecutionInput[] = [];
    const executionPort: AssistantExecutionPort = {
      executeChat: vi.fn(async (input) => {
        if (input.runId === "run-blocker") await blockerGate;
        return undefined;
      }),
      executeGenerate: vi.fn(async (input) => {
        generateInputs.push(input);
      }),
    };

    engine = createAssistantEngine({
      executionPort,
      // INVARIANT: Compatibility transports remain registered until the React adapter
      // migration, but identity-bearing commands must not resolve through them.
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      emit: (event) => events.push(event),
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      isRunStreaming: () => true,
      readConversationState,
    });

    const blocker = engine.dispatch({
      type: "executeChat",
      conversationId: "A",
      input: {
        runId: "run-blocker",
        execution: { profileId: "profile-blocker" },
        request: {
          input: { modelId: "model-blocker", prompt: "block" },
          messages: [{ role: "user", content: "block" }],
        },
      },
    }) as Promise<void>;
    await Promise.resolve();

    const execution = {
      profileId: "profile-a",
      template: {
        id: 1,
        content: {
          fields: [{ id: 1, title: "Front A", isRequired: true, type: "text" }],
        },
      },
    };
    const request: CardGenerationStreamRequest = {
      input: { modelId: "model-a", prompt: "prompt-a", templateId: 1 },
      messages: [{ role: "user", content: "history-a" }],
      systemPromptTemplate: "system-a",
    };

    const queued = engine.dispatch({
      type: "executeGenerate",
      conversationId: "A",
      input: { runId: "run-a", execution, request },
    }) as Promise<void>;

    execution.profileId = "profile-b";
    execution.template.id = 2;
    execution.template.content.fields[0]!.title = "Front B";
    request.input.modelId = "model-b";
    request.messages[0]!.content = "history-b";
    request.systemPromptTemplate = "system-b";

    releaseBlocker();
    await blocker;
    await queued;

    expect(generateInputs).toHaveLength(1);
    expect(generateInputs[0]).toMatchObject({
      kind: "cards",
      conversationId: "A",
      runId: "run-a",
      identity: {
        profileId: "profile-a",
        template: {
          id: 1,
          content: { fields: [{ title: "Front A" }] },
        },
      },
      request: {
        input: { modelId: "model-a", prompt: "prompt-a", templateId: 1 },
        messages: [{ content: "history-a" }],
        systemPromptTemplate: "system-a",
      },
    });
    expect(generateInputs[0]?.identity).not.toBe(execution);
    expect(generateInputs[0]?.request).not.toBe(request);
    expect(chatStreamGenerator).not.toHaveBeenCalled();
    expect(streamGenerator).not.toHaveBeenCalled();
  });

  it("concurrent A/B chat runs do not cross-dispatch stream chunks", async () => {
    let resolveA!: () => void;
    let resolveB!: () => void;
    const gateA = new Promise<void>((resolve) => {
      resolveA = resolve;
    });
    const gateB = new Promise<void>((resolve) => {
      resolveB = resolve;
    });

    chatStreamGenerator.mockImplementation(async (req, onChunk) => {
      const label = (req as { label?: string }).label;
      if (label === "a") {
        onChunk("from-a");
        await gateA;
        return undefined;
      }
      onChunk("from-b");
      await gateB;
      return undefined;
    });

    const runA = engine.executeChatRun("A", "run-a", { label: "a" } as ChatStreamRequest & { label: string });
    const runB = engine.executeChatRun("B", "run-b", { label: "b" } as ChatStreamRequest & { label: string });
    await Promise.resolve();
    await Promise.resolve();

    resolveA();
    resolveB();
    await Promise.all([runA, runB]);

    const textById = events
      .filter(
        (e): e is Extract<AssistantEvent, { type: "runChunk" }> =>
          e.type === "runChunk" && e.chunk.kind === "assistantText",
      )
      .map((e) => ({
        id: e.conversationId,
        text: e.chunk.kind === "assistantText" ? e.chunk.text : "",
      }));

    expect(textById.filter((e) => e.id === "A").every((e) => e.text.includes("from-a"))).toBe(true);
    expect(textById.filter((e) => e.id === "B").every((e) => e.text.includes("from-b"))).toBe(true);
    expect(textById.some((e) => e.id === "A" && e.text.includes("from-b"))).toBe(false);
    expect(textById.some((e) => e.id === "B" && e.text.includes("from-a"))).toBe(false);

    const completes = events.filter((e) => e.type === "runTerminated" && e.outcome.status === "success");
    expect(completes.map((e) => e.conversationId).sort()).toEqual(["A", "B"]);
  });

  it("cancel before dequeue prevents provider execution", async () => {
    const streaming = new Set(["run-blocker", "run-queued"]);
    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      emit: (event) => {
        events.push(event);
        if (event.type === "runTerminated") {
          streaming.delete(event.runId);
        }
      },
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      isRunStreaming: (_conversationId, runId) => streaming.has(runId),
      readConversationState,
    });

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const startedRunIds: string[] = [];

    chatStreamGenerator.mockImplementation(async (req) => {
      const runLabel = (req as { label?: string }).label ?? "unknown";
      startedRunIds.push(runLabel);
      if (runLabel === "blocker") {
        await firstGate;
      }
      return undefined;
    });

    const firstRun = engine.executeChatRun("A", "run-blocker", { label: "blocker" } as ChatStreamRequest & {
      label: string;
    });
    await Promise.resolve();

    const queuedRun = engine.executeChatRun("A", "run-queued", { label: "queued" } as ChatStreamRequest & {
      label: string;
    });
    await Promise.resolve();

    engine.cancel("A", "run-queued");

    releaseFirst();
    await firstRun;
    await queuedRun;

    expect(startedRunIds).toEqual(["blocker"]);
    expect(chatStreamGenerator).toHaveBeenCalledTimes(1);

    const cancelActions = events.filter(
      (e): e is Extract<AssistantEvent, { type: "runTerminated" }> =>
        e.type === "runTerminated" && e.outcome.status === "canceled",
    );
    expect(cancelActions.some((e) => e.runId === "run-queued")).toBe(true);
  });

  it("cancel in-flight twice then retry same runId still runs", async () => {
    const streaming = new Set(["run-1"]);
    conversationStates["A"] = { runs: { "run-1": { mode: "chat" } } };

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      emit: (event) => {
        events.push(event);
        if (event.type === "runTerminated") {
          streaming.delete(event.runId);
        }
        if (event.type === "runStarted") {
          streaming.add(event.run.runId);
        }
      },
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      isRunStreaming: (_conversationId, runId) => streaming.has(runId),
      readConversationState,
    });

    const signals: AbortSignal[] = [];
    let providerCalls = 0;

    chatStreamGenerator.mockImplementation(async (_req, onChunk, signal) => {
      providerCalls += 1;
      signals.push(signal);
      if (providerCalls === 1) {
        await holdUntilAborted(signal);
        return undefined;
      }
      onChunk("retried");
      return undefined;
    });

    const firstRun = engine.executeChatRun("A", "run-1", {} as ChatStreamRequest);
    await Promise.resolve();
    expect(signals).toHaveLength(1);

    engine.cancel("A", "run-1");
    engine.cancel("A", "run-1");
    await expect(firstRun).resolves.toBeUndefined();
    expect(streaming.has("run-1")).toBe(false);

    await engine.retryRun("A", "run-1", {} as ChatStreamRequest, null, "chat");

    expect(providerCalls).toBe(2);
    const restartActions = events.filter((e) => e.type === "runStarted");
    expect(restartActions).toHaveLength(1);
    expect(restartActions[0]?.type === "runStarted" && restartActions[0].run.runId).toBe("run-1");

    const retryChunks = events.filter(
      (e) => e.type === "runChunk" && e.chunk.kind === "assistantText" && e.chunk.text === "retried",
    );
    expect(retryChunks).toHaveLength(1);
  });

  it("shutdownGracefully rejects new work and cancels queued work", async () => {
    const streaming = new Set(["run-active", "run-queued"]);
    const flushAllBounded = vi.fn(async () => undefined);

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      emit: (event) => {
        events.push(event);
        if (event.type === "runTerminated") {
          streaming.delete(event.runId);
        }
      },
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      isRunStreaming: (_conversationId, runId) => streaming.has(runId),
      readConversationState,
    });
    engine.setPersistenceHost({
      flushAllNow: vi.fn(),
      flushAllBounded,
      retrySave: vi.fn(),
      beginDelete: vi.fn(async () => ({ commit: () => {}, rollback: () => {} })),
      prepareDelete: vi.fn(async () => undefined),
      isTombstoned: vi.fn(() => false),
      dispose: vi.fn(),
    });

    const signals: AbortSignal[] = [];
    const startedRunIds: string[] = [];

    chatStreamGenerator.mockImplementation(async (req, _onChunk, signal) => {
      const label = (req as { label?: string }).label ?? "unknown";
      startedRunIds.push(label);
      signals.push(signal);
      await holdUntilAborted(signal);
      return undefined;
    });

    const activeRun = engine.executeChatRun("A", "run-active", { label: "active" } as ChatStreamRequest & {
      label: string;
    });
    await Promise.resolve();

    const queuedRun = engine.executeChatRun("A", "run-queued", { label: "queued" } as ChatStreamRequest & {
      label: string;
    });
    await Promise.resolve();

    expect(startedRunIds).toEqual(["active"]);

    await engine.shutdownGracefully({
      interruptActiveRuns: () => {
        for (const runId of [...streaming]) {
          streaming.delete(runId);
          events.push({
            type: "runTerminated",
            conversationId: "A",
            runId,
            outcome: { status: "interrupted", reason: "app_shutdown" },
          });
        }
      },
      flushTimeoutMs: 0,
    });

    await expect(activeRun).resolves.toBeUndefined();
    await expect(queuedRun).resolves.toBeUndefined();

    expect(startedRunIds).toEqual(["active"]);
    expect(signals[0]?.aborted).toBe(true);
    expect(flushAllBounded).toHaveBeenCalled();
    expect(engine.lifecycle).toBe("closed");

    await expect(engine.executeChatRun("A", "run-after", {} as ChatStreamRequest)).rejects.toMatchObject({
      name: "AssistantEngineClosedError",
    });
  });

  it("dispose cannot be followed by beginRun via executeChatRun", async () => {
    chatStreamGenerator.mockImplementation(async () => undefined);

    engine.dispose();
    expect(engine.lifecycle).toBe("closed");

    await expect(engine.executeChatRun("A", "run-1", {} as ChatStreamRequest)).rejects.toMatchObject({
      name: "AssistantEngineClosedError",
    });
    expect(chatStreamGenerator).not.toHaveBeenCalled();
  });

  it("disposeConversation closes only that conversation runtime", async () => {
    const streaming = new Set<string>(["run-a", "run-b"]);
    conversationStates.A = { runs: { "run-a": { mode: "chat" } } };
    conversationStates.B = { runs: { "run-b": { mode: "chat" } } };

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      emit: (event) => {
        events.push(event);
      },
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      isRunStreaming: (_conversationId, runId) => streaming.has(runId),
      readConversationState,
    });

    chatStreamGenerator.mockImplementation(async (_req, _onChunk, signal) => {
      await holdUntilAborted(signal);
      return undefined;
    });

    const runA = engine.executeChatRun("A", "run-a", {} as ChatStreamRequest);
    const runB = engine.executeChatRun("B", "run-b", {} as ChatStreamRequest);
    await Promise.resolve();

    engine.disposeConversation("A");
    streaming.delete("run-a");
    await expect(runA).resolves.toBeUndefined();

    expect(engine.lifecycle).toBe("running");
    engine.cancel("B", "run-b");
    streaming.delete("run-b");
    await expect(runB).resolves.toBeUndefined();
  });

  it("disposeConversation aborts in-flight streams only while store still has run keys", async () => {
    const signals: AbortSignal[] = [];
    conversationStates.A = { runs: { "run-kept": { mode: "chat" } } };
    conversationStates.B = { runs: { "run-cleared": { mode: "chat" } } };

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      emit: (event) => {
        events.push(event);
      },
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      isRunStreaming: () => true,
      readConversationState,
    });

    chatStreamGenerator.mockImplementation(async (_req, _onChunk, signal) => {
      signals.push(signal);
      await holdUntilAborted(signal);
      return undefined;
    });

    const kept = engine.executeChatRun("A", "run-kept", {} as ChatStreamRequest);
    const cleared = engine.executeChatRun("B", "run-cleared", {} as ChatStreamRequest);
    await Promise.resolve();
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(false);
    expect(signals[1]?.aborted).toBe(false);

    // Regression: empty runs before dispose skips abort (wrong delete order).
    conversationStates.B = { runs: {} };
    engine.disposeConversation("B");
    expect(signals[1]?.aborted).toBe(false);

    // Correct order: dispose while store still has run keys, then clear.
    engine.disposeConversation("A");
    expect(signals[0]?.aborted).toBe(true);
    delete conversationStates.A;

    await expect(kept).resolves.toBeUndefined();
    engine.cancel("B", "run-cleared");
    await expect(cleared).resolves.toBeUndefined();
  });

  it("dispose during shutdown flush does not dispose the persistence host", async () => {
    let releaseFlush!: () => void;
    const flushGate = new Promise<void>((resolve) => {
      releaseFlush = resolve;
    });
    const flushAllBounded = vi.fn(async () => {
      await flushGate;
    });
    const hostDispose = vi.fn();

    engine.setPersistenceHost({
      flushAllNow: vi.fn(),
      flushAllBounded,
      retrySave: vi.fn(),
      beginDelete: vi.fn(async () => ({ commit: () => {}, rollback: () => {} })),
      prepareDelete: vi.fn(async () => undefined),
      isTombstoned: vi.fn(() => false),
      dispose: hostDispose,
    });

    const shutdownPromise = engine.shutdownGracefully({
      interruptActiveRuns: () => undefined,
      flushTimeoutMs: 60_000,
    });

    await Promise.resolve();
    expect(engine.lifecycle).toBe("closing");
    expect(flushAllBounded).toHaveBeenCalled();

    engine.dispose();
    expect(hostDispose).not.toHaveBeenCalled();
    expect(engine.lifecycle).toBe("closing");

    releaseFlush();
    await shutdownPromise;

    expect(engine.lifecycle).toBe("closed");
    expect(hostDispose).not.toHaveBeenCalled();
  });

  it("does not classify unrequested AbortError as user cancellation", async () => {
    chatStreamGenerator.mockImplementation(async (_req, onChunk) => {
      onChunk("partial");
      throw new DOMException("Aborted", "AbortError");
    });

    await engine.executeChatRun("conv-a", "run-1", {} as ChatStreamRequest);

    const cancelActions = events.filter((e) => e.type === "runTerminated" && e.outcome.status === "canceled");
    const failedActions = events.filter((e) => e.type === "runTerminated" && e.outcome.status === "failed");
    expect(cancelActions).toHaveLength(0);
    expect(failedActions).toHaveLength(1);
    expect(failedActions[0]?.conversationId).toBe("conv-a");
    expect(failedActions[0]).toMatchObject({
      runId: "run-1",
      outcome: { status: "failed", error: { message: "Provider aborted the request" } },
    });
  });

  it("classifies requested user cancel AbortError as cancelRun", async () => {
    const signals: AbortSignal[] = [];
    chatStreamGenerator.mockImplementation(async (_req, _onChunk, signal) => {
      signals.push(signal);
      await holdUntilAborted(signal);
      return undefined;
    });

    const runPromise = engine.executeChatRun("conv-a", "run-1", {} as ChatStreamRequest);
    await Promise.resolve();
    expect(signals).toHaveLength(1);

    engine.cancel("conv-a", "run-1");
    await expect(runPromise).resolves.toBeUndefined();

    const cancelActions = events.filter(
      (e): e is Extract<AssistantEvent, { type: "runTerminated" }> =>
        e.type === "runTerminated" && e.outcome.status === "canceled",
    );
    const failedActions = events.filter((e) => e.type === "runTerminated" && e.outcome.status === "failed");
    expect(cancelActions).toHaveLength(1);
    expect(cancelActions[0]?.runId).toBe("run-1");
    expect(failedActions).toHaveLength(0);
  });

  it("does not classify shutdown AbortError as user cancellation", async () => {
    const streaming = new Set(["run-1"]);
    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      emit: (event) => {
        events.push(event);
        if (event.type === "runTerminated") {
          streaming.delete(event.runId);
        }
      },
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      isRunStreaming: (_conversationId, runId) => streaming.has(runId),
      readConversationState,
    });

    chatStreamGenerator.mockImplementation(async (_req, _onChunk, signal) => {
      await holdUntilAborted(signal);
      return undefined;
    });

    const runPromise = engine.executeChatRun("conv-a", "run-1", {} as ChatStreamRequest);
    await Promise.resolve();

    await engine.shutdownGracefully({
      interruptActiveRuns: () => {
        for (const runId of [...streaming]) {
          streaming.delete(runId);
          events.push({
            type: "runTerminated",
            conversationId: "conv-a",
            runId,
            outcome: { status: "interrupted", reason: "app_shutdown" },
          });
        }
      },
      flushTimeoutMs: 0,
    });

    await expect(runPromise).resolves.toBeUndefined();

    const cancelActions = events.filter((e) => e.type === "runTerminated" && e.outcome.status === "canceled");
    const interruptActions = events.filter((e) => e.type === "runTerminated" && e.outcome.status === "interrupted");
    const failedActions = events.filter((e) => e.type === "runTerminated" && e.outcome.status === "failed");
    expect(cancelActions).toHaveLength(0);
    expect(failedActions).toHaveLength(0);
    expect(
      interruptActions.some(
        (e) => e.type === "runTerminated" && e.outcome.status === "interrupted" && e.outcome.reason === "app_shutdown",
      ),
    ).toBe(true);
  });
});
