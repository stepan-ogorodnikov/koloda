import { render, renderHook, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import * as React from "react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeRun } from "../state/assistant-conversation.fixtures";
import { assistantMessageId, createTextMessage } from "../state/assistant-messages";
import { initialConversationState } from "../state/conversation-reducer";
import type { GenerationRun } from "../state/conversation-reducer";
import { conversationsAtom, currentConversationIdAtom } from "../state/conversation-store";
import { useAssistantMessageRenderer } from "./use-assistant-message-renderer";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

vi.mock("@koloda/ai-react", () => ({
  AIChatMessageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AIChatMessageStatus: (props: {
    state: string;
    canRetry?: boolean;
    onRetry?: () => void;
    elapsedSeconds?: number;
  }) => (
    <div data-testid={`status-${props.state}`}>
      {props.canRetry ? (
        <button type="button" onClick={props.onRetry}>
          retry
        </button>
      ) : null}
    </div>
  ),
  AIToolActivity: ({ calls }: { calls: Array<{ name: string }> }) => (
    <div data-testid="tool-activity">{calls.map((entry) => entry.name).join(",")}</div>
  ),
}));

vi.mock("./copy-message-button", () => ({
  CopyMessageButton: () => null,
}));

function mountRenderer(runs: Record<string, GenerationRun>, options: { assistantText?: string } = {}) {
  const conversationId = "c1";
  const runId = "r1";
  const store = createStore();
  store.set(currentConversationIdAtom, conversationId);
  store.set(conversationsAtom, {
    [conversationId]: {
      ...initialConversationState,
      id: conversationId,
      messages: [
        createTextMessage("user-r1", "user", "Hi", {
          createdAt: "2026-07-01T11:00:00.000Z",
          runId,
        }),
        createTextMessage(assistantMessageId(runId), "assistant", options.assistantText ?? "Hello", {
          kind: "chat-text",
          runId,
        }),
      ],
      runs,
    },
  });

  const Wrapper = ({ children }: PropsWithChildren) => <JotaiProvider store={store}>{children}</JotaiProvider>;

  const handleRetry = vi.fn();
  const handleRevert = vi.fn();
  const { result } = renderHook(
    () =>
      useAssistantMessageRenderer({
        templateId: undefined,
        handleRetry,
        handleRevert,
      }),
    { wrapper: Wrapper },
  );

  const assistantMessage = store.get(conversationsAtom)[conversationId]!.messages[1]!;
  const rendered = result.current(assistantMessage, <p>Hello</p>);
  render(<>{rendered}</>);

  return { handleRetry, runId };
}

describe("useAssistantMessageRenderer", () => {
  it.each([
    { status: "canceled" as const, label: "canceled" },
    { status: "interrupted" as const, label: "interrupted" },
  ])("renders $label chat status and retry when elapsedSeconds is null", ({ status, label }) => {
    const run = { ...makeRun("r1", status), elapsedSeconds: null };
    const { handleRetry, runId } = mountRenderer({ r1: run });

    expect(screen.getByTestId(`status-${label}`)).toBeTruthy();
    screen.getByRole("button", { name: "retry" }).click();
    expect(handleRetry).toHaveBeenCalledWith(runId);
  });

  it("renders tool activity on a streaming chat message", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      toolCalls: [{ id: "call-1", name: "list_decks", input: {}, status: "running" as const }],
    };
    mountRenderer({ r1: run }, { assistantText: "" });
    expect(screen.getByTestId("tool-activity").textContent).toBe("list_decks");
    expect(screen.queryByTestId("status-pending")).toBeNull();
  });

  it("renders tool activity above streaming text", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      toolCalls: [{ id: "call-1", name: "list_decks", input: {}, status: "success" as const, output: { decks: [] } }],
    };
    mountRenderer({ r1: run });
    expect(screen.getByTestId("tool-activity").textContent).toBe("list_decks");
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("renders tool activity on a completed chat message", () => {
    const run = {
      ...makeRun("r1", "success"),
      toolCalls: [
        {
          id: "call-1",
          name: "list_decks",
          input: {},
          status: "success" as const,
          output: { decks: [{ deckId: 1 }] },
        },
      ],
    };
    mountRenderer({ r1: run });
    expect(screen.getByTestId("tool-activity").textContent).toBe("list_decks");
    expect(screen.getByTestId("status-success")).toBeTruthy();
  });
});
