import type { ChatStreamGenerator, ChatStreamRequest } from "@koloda/ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAssistantEngine } from "./assistant-engine";
import type { CardGenerationExecutor } from "./card-generation";

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
  let chatStreamGenerator: ReturnType<typeof vi.fn<ChatStreamGenerator>>;
  let streamGenerator: ReturnType<typeof vi.fn<CardGenerationExecutor>>;
  let engine: ReturnType<typeof createAssistantEngine>;

  beforeEach(() => {
    dispatchToMap.length = 0;
    chatStreamGenerator = vi.fn<ChatStreamGenerator>();
    streamGenerator = vi.fn<CardGenerationExecutor>();

    engine = createAssistantEngine({
      getChatStreamGenerator: () => chatStreamGenerator,
      getStreamGenerator: () => streamGenerator,
      dispatch: vi.fn(),
      dispatchToConversation: (id, action) => {
        dispatchToMap.push({ id, action });
      },
      markReadIfCurrent: vi.fn(),
      touch: vi.fn(),
      readState: () => ({ id: "current", runs: {} }),
    });
  });

  it("cancel(runId) aborts only the targeted run", async () => {
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

    engine.cancel("run-a");
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    await expect(runA).resolves.toBeUndefined();

    engine.cancel("run-b");
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
});
