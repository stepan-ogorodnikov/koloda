import type { ChatStreamRequest } from "@koloda/ai";
import { describe, expect, it, vi } from "vitest";
import { AssistantDuplicateRunError, AssistantEngineClosedError } from "./assistant-engine";
import type { AssistantExecutionPort } from "./assistant-execution-port";
import type { AssistantEvent } from "./assistant-protocol";
import type { CardGenerationStreamRequest } from "./card-generation";
import { createConversationRuntime } from "./conversation-runtime";
import { createRunControllerRegistry } from "./run-controller-registry";

const TEST_EXECUTION = { profileId: "test-profile" } as const;

function unusedPort(): AssistantExecutionPort {
  return {
    executeChat: vi.fn(async () => undefined),
    executeGenerate: vi.fn(async () => undefined),
  };
}

describe("createConversationRuntime closed-registry races", () => {
  it("closed registry at beginRun interrupts without remaining streaming or rejecting", async () => {
    const events: AssistantEvent[] = [];
    const streaming = new Set<string>(["run-1"]);
    const registry = createRunControllerRegistry();
    const executionPort = unusedPort();

    const runtime = createConversationRuntime(
      "conv-a",
      {
        emit: (event) => {
          events.push(event);
          if (
            event.type === "runTerminated" &&
            (event.outcome.status === "interrupted" ||
              event.outcome.status === "canceled" ||
              event.outcome.status === "failed" ||
              event.outcome.status === "success")
          ) {
            streaming.delete(event.runId);
          }
        },
        markReadIfCurrent: vi.fn(),
        touch: vi.fn(),
        isRunStreaming: (_conversationId, runId) => streaming.has(runId),
        readConversationState: () => ({ runs: { "run-1": { mode: "chat" } } }),
      },
      { executionPort },
      registry,
    );

    // WHY: Queue still open, registry already sealed — models a dequeued task
    // that reaches beginRun after shutdown dispose.
    registry.dispose("app_shutdown");

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      await expect(runtime.executeChatRun("run-1", {} as ChatStreamRequest, TEST_EXECUTION)).resolves.toBeUndefined();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(unhandled).toEqual([]);
    expect(executionPort.executeChat).not.toHaveBeenCalled();
    expect(streaming.has("run-1")).toBe(false);
    expect(events).toContainEqual({
      type: "runTerminated",
      conversationId: "conv-a",
      runId: "run-1",
      outcome: { status: "interrupted", reason: "app_shutdown" },
    });
  });

  it("closed registry at beginRun for generate settles as interrupted", async () => {
    const events: AssistantEvent[] = [];
    const streaming = new Set<string>(["run-cards"]);
    const registry = createRunControllerRegistry();
    const executionPort = unusedPort();

    const runtime = createConversationRuntime(
      "conv-a",
      {
        emit: (event) => {
          events.push(event);
          if (event.type === "runTerminated") {
            streaming.delete(event.runId);
          }
        },
        markReadIfCurrent: vi.fn(),
        touch: vi.fn(),
        isRunStreaming: (_conversationId, runId) => streaming.has(runId),
        readConversationState: () => ({ runs: { "run-cards": { mode: "cards" } } }),
      },
      { executionPort },
      registry,
    );

    registry.dispose("dispose");

    const request: CardGenerationStreamRequest = {
      input: { modelId: "m", prompt: "p", templateId: 1 },
      messages: [],
    };
    await expect(runtime.executeGenerateRun("run-cards", request, TEST_EXECUTION)).resolves.toBeUndefined();

    expect(executionPort.executeGenerate).not.toHaveBeenCalled();
    expect(streaming.has("run-cards")).toBe(false);
    expect(events).toContainEqual({
      type: "runTerminated",
      conversationId: "conv-a",
      runId: "run-cards",
      outcome: { status: "interrupted", reason: "app_shutdown" },
    });
  });
});

describe("createConversationRuntime command acceptance", () => {
  function makeRuntime() {
    return createConversationRuntime(
      "conv-a",
      {
        emit: vi.fn(),
        markReadIfCurrent: vi.fn(),
        touch: vi.fn(),
        isRunStreaming: () => true,
        readConversationState: () => ({ runs: {} }),
      },
      { executionPort: unusedPort() },
      createRunControllerRegistry(),
    );
  }

  it("duplicate execute throws synchronously without occupying a second slot", async () => {
    const runtime = makeRuntime();
    const first = runtime.executeChatRun("run-1", {} as ChatStreamRequest, TEST_EXECUTION);

    expect(() => runtime.executeChatRun("run-2", {} as ChatStreamRequest, TEST_EXECUTION)).toThrow(
      AssistantDuplicateRunError,
    );

    await first;
  });

  it("closed queue throws AssistantEngineClosedError synchronously", () => {
    const runtime = makeRuntime();
    runtime.close("dispose");
    expect(() => runtime.executeChatRun("run-1", {} as ChatStreamRequest, TEST_EXECUTION)).toThrow(
      AssistantEngineClosedError,
    );
  });
});
