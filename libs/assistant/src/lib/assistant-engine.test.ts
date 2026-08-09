import type { AIChatMode, ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAssistantEngine } from "./assistant-engine";
import type { CardGenerationExecutor } from "./card-generation";

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
  const dispatchToMap: Array<{ id: string; action: unknown }> = [];
  const conversationStates: Record<string, ConversationStateSnapshot> = {};
  let chatStreamGenerator: ReturnType<typeof vi.fn<ChatStreamGenerator>>;
  let streamGenerator: ReturnType<typeof vi.fn<CardGenerationExecutor>>;
  let engine: ReturnType<typeof createAssistantEngine>;
  let readConversationState: ReturnType<typeof vi.fn<(conversationId: string) => ConversationStateSnapshot>>;

  beforeEach(() => {
    dispatchToMap.length = 0;
    for (const key of Object.keys(conversationStates)) delete conversationStates[key];
    chatStreamGenerator = vi.fn<ChatStreamGenerator>();
    streamGenerator = vi.fn<CardGenerationExecutor>();
    readConversationState = vi.fn<(conversationId: string) => ConversationStateSnapshot>(
      (conversationId) => conversationStates[conversationId] ?? { runs: {} },
    );

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      dispatchToConversation: (id, action) => {
        dispatchToMap.push({ id, action });
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

    const updates = dispatchToMap.filter((e) => (e.action as [string])[0] === "updateAssistantText");
    expect(updates.some((e) => e.id === "conv-a")).toBe(true);
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

    const restartActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "restartRun");
    expect(restartActions).toHaveLength(1);
    expect(restartActions[0]?.id).toBe("A");

    const clearActions = dispatchToMap.filter(
      (e) =>
        (e.action as [string, { runId?: string; text?: string }])[0] === "updateAssistantText" &&
        (e.action as [string, { runId?: string; text?: string }])[1]?.text === "",
    );
    expect(clearActions.some((e) => e.id === "A")).toBe(true);
    expect(clearActions.some((e) => e.id === "B")).toBe(false);

    const chunkUpdates = dispatchToMap.filter(
      (e) =>
        (e.action as [string, { text?: string }])[0] === "updateAssistantText" &&
        (e.action as [string, { text?: string }])[1]?.text === "retried",
    );
    expect(chunkUpdates).toHaveLength(1);
    expect(chunkUpdates[0]?.id).toBe("A");

    expect(readConversationState).toHaveBeenCalledWith("A");
    expect(dispatchToMap.some((e) => e.id === "B")).toBe(false);
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

    const textById = dispatchToMap
      .filter((e) => (e.action as [string])[0] === "updateAssistantText")
      .map((e) => ({
        id: e.id,
        text: (e.action as [string, { text: string }])[1].text,
      }));

    expect(textById.filter((e) => e.id === "A").every((e) => e.text.includes("from-a"))).toBe(true);
    expect(textById.filter((e) => e.id === "B").every((e) => e.text.includes("from-b"))).toBe(true);
    expect(textById.some((e) => e.id === "A" && e.text.includes("from-b"))).toBe(false);
    expect(textById.some((e) => e.id === "B" && e.text.includes("from-a"))).toBe(false);

    const completes = dispatchToMap.filter((e) => (e.action as [string])[0] === "completeRun");
    expect(completes.map((e) => e.id).sort()).toEqual(["A", "B"]);
  });

  it("cancel before dequeue prevents provider execution", async () => {
    const streaming = new Set(["run-blocker", "run-queued"]);
    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      dispatchToConversation: (id, action) => {
        dispatchToMap.push({ id, action });
        const [type, payload] = action as [string, { runId?: string }];
        if ((type === "cancelRun" || type === "completeRun" || type === "interruptRun") && payload.runId) {
          streaming.delete(payload.runId);
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

    const cancelActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "cancelRun");
    expect(cancelActions.some((e) => (e.action as [string, { runId: string }])[1].runId === "run-queued")).toBe(true);
  });

  it("cancel in-flight twice then retry same runId still runs", async () => {
    const streaming = new Set(["run-1"]);
    conversationStates["A"] = { runs: { "run-1": { mode: "chat" } } };

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      dispatchToConversation: (id, action) => {
        dispatchToMap.push({ id, action });
        const [type, payload] = action as [string, { runId?: string }];
        if ((type === "cancelRun" || type === "completeRun" || type === "interruptRun") && payload.runId) {
          streaming.delete(payload.runId);
        }
        if (type === "restartRun" && payload.runId) {
          streaming.add(payload.runId);
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
    const restartActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "restartRun");
    expect(restartActions).toHaveLength(1);
    expect((restartActions[0]?.action as [string, { runId: string }])[1].runId).toBe("run-1");

    const retryChunks = dispatchToMap.filter(
      (e) =>
        (e.action as [string, { text?: string }])[0] === "updateAssistantText" &&
        (e.action as [string, { text?: string }])[1]?.text === "retried",
    );
    expect(retryChunks).toHaveLength(1);
  });

  it("shutdownGracefully rejects new work and cancels queued work", async () => {
    const streaming = new Set(["run-active", "run-queued"]);
    const flushAllBounded = vi.fn(async () => undefined);

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      dispatchToConversation: (id, action) => {
        dispatchToMap.push({ id, action });
        const [type, payload] = action as [string, { runId?: string }];
        if ((type === "cancelRun" || type === "completeRun" || type === "interruptRun") && payload.runId) {
          streaming.delete(payload.runId);
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
          dispatchToMap.push({
            id: "A",
            action: ["interruptRun", { runId, reason: "app_shutdown" }],
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

    const cancelActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "cancelRun");
    const failedActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "runFailed");
    expect(cancelActions).toHaveLength(0);
    expect(failedActions).toHaveLength(1);
    expect(failedActions[0]?.id).toBe("conv-a");
    expect((failedActions[0]?.action as [string, { runId: string; error: { message: string } }])[1]).toMatchObject({
      runId: "run-1",
      error: { message: "Provider aborted the request" },
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

    const cancelActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "cancelRun");
    const failedActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "runFailed");
    expect(cancelActions).toHaveLength(1);
    expect((cancelActions[0]?.action as [string, { runId: string }])[1].runId).toBe("run-1");
    expect(failedActions).toHaveLength(0);
  });

  it("does not classify shutdown AbortError as user cancellation", async () => {
    const streaming = new Set(["run-1"]);
    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      dispatchToConversation: (id, action) => {
        dispatchToMap.push({ id, action });
        const [type, payload] = action as [string, { runId?: string }];
        if (
          (type === "cancelRun" || type === "completeRun" || type === "interruptRun" || type === "runFailed") &&
          payload.runId
        ) {
          streaming.delete(payload.runId);
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
          dispatchToMap.push({
            id: "conv-a",
            action: ["interruptRun", { runId, reason: "app_shutdown" }],
          });
        }
      },
      flushTimeoutMs: 0,
    });

    await expect(runPromise).resolves.toBeUndefined();

    const cancelActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "cancelRun");
    const interruptActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "interruptRun");
    const failedActions = dispatchToMap.filter((e) => (e.action as [string])[0] === "runFailed");
    expect(cancelActions).toHaveLength(0);
    expect(failedActions).toHaveLength(0);
    expect(interruptActions.some((e) => (e.action as [string, { reason: string }])[1].reason === "app_shutdown")).toBe(
      true,
    );
  });
});
