import { getTextMessageContent } from "@koloda/ai";
import { act, render, renderHook, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider, useAtomValue } from "jotai";
import * as React from "react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeRun } from "../state/assistant-conversation.fixtures";
import { assistantMessageId, createTextMessage } from "../state/assistant-messages";
import { initialConversationState } from "../state/conversation-types";
import type { AssistantRun } from "../state/conversation-types";
import { assistantMessagesAtom } from "../state/conversation-selectors";
import {
  assistantConversationStateAtom,
  conversationsAtom,
  currentConversationIdAtom,
} from "../state/conversation-store";
import { useAssistantMessageRenderer } from "./use-assistant-message-renderer";
import { testId } from "../../test/test-helpers";

// Records which run's activity row or card table rendered, for the render-count test.
const stubRenders = vi.hoisted(() => vi.fn<(widget: "activity" | "cards", key: string | undefined) => void>());

vi.mock("@koloda/ai-react", () => ({
  AIChatMessage: ({ parts }: { parts: Array<{ type: string; text?: string }> }) => (
    <p>{parts.map((part) => (part.type === "text" ? part.text : "")).join("")}</p>
  ),
  AIChatMessageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AIChatMessageStatus: (props: {
    state: string;
    canRetry?: boolean;
    onRetry?: () => void;
    elapsedSeconds?: number;
    isStepBudgetReached?: boolean;
    actions?: React.ReactNode;
  }) => (
    <div data-testid={`status-${props.state}`} data-step-budget={String(!!props.isStepBudgetReached)}>
      {props.actions}
      {props.canRetry ? (
        <button type="button" onClick={props.onRetry}>
          retry
        </button>
      ) : null}
    </div>
  ),
  AIToolActivity: ({
    calls,
    renderText,
  }: {
    calls: Array<{ id: string; name?: string; kind?: string }>;
    renderText?: (text: string) => React.ReactNode;
  }) => {
    stubRenders("activity", calls[0]?.id);
    return (
      <div data-testid="tool-activity" data-has-render-text={renderText ? "true" : "false"}>
        {calls.map((entry) => (entry.kind === "reasoning" ? "thinking" : entry.name)).join(",")}
      </div>
    );
  },
}));

vi.mock("./copy-message-button", () => ({
  CopyMessageButton: ({ text }: { text: string }) => <div data-testid="copy-button" data-text={text} />,
}));

vi.mock("./assistant-cards-message", () => ({
  AssistantCardsMessage: (props: {
    runId: string;
    canAdd: boolean;
    deckId: string | null;
    templateId: string | undefined;
  }) => {
    stubRenders("cards", props.runId);
    return (
      <div
        data-testid="cards-table"
        data-can-add={String(props.canAdd)}
        data-deck-id={String(props.deckId)}
        data-template-id={String(props.templateId)}
      />
    );
  },
}));

const sampleCard = { content: { [testId(1)]: { text: "Q" }, [testId(2)]: { text: "A" } } };
const sampleFields = [
  { id: testId(1), title: "Front", type: "text" as const, isRequired: true },
  { id: testId(2), title: "Back", type: "text" as const, isRequired: true },
];

function mountRenderer(
  runs: Record<string, AssistantRun>,
  options: {
    assistantText?: string;
    kind?: "chat-text";
    activeRunId?: string | null;
  } = {},
) {
  const conversationId = "c1";
  const runId = "r1";
  const store = createStore();
  store.set(currentConversationIdAtom, conversationId);
  store.set(conversationsAtom, {
    [conversationId]: {
      ...initialConversationState,
      id: conversationId,
      activeRunId: options.activeRunId === undefined ? null : options.activeRunId,
      messages: [
        createTextMessage("user-r1", "user", "Hi", {
          createdAt: "2026-07-01T11:00:00.000Z",
          runId,
        }),
        createTextMessage(assistantMessageId(runId), "assistant", options.assistantText ?? "Hello", {
          kind: options.kind ?? "chat-text",
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

  it.each([
    { label: "a chat turn", cards: [] },
    { label: "a card turn", cards: [sampleCard] },
  ])("keeps activity and copy on $label that succeeded without a saved duration", ({ cards }) => {
    const run = {
      ...makeRun("r1", "success"),
      elapsedSeconds: null,
      cards,
      templateFields: sampleFields,
      toolCalls: [
        {
          kind: "reasoning" as const,
          id: "r1-reasoning-0",
          text: "plan",
          status: "done" as const,
          startedAt: new Date(0),
          elapsedSeconds: 2,
        },
      ],
    };
    mountRenderer({ r1: run });

    expect(screen.getByTestId("tool-activity").textContent).toBe("thinking");
    expect(screen.getByTestId("copy-button")).toBeTruthy();
  });

  it.each([
    { label: "a chat turn", cards: [], stopNote: "step_budget" as const, expected: "true" },
    { label: "a card turn", cards: [sampleCard], stopNote: "step_budget" as const, expected: "true" },
    { label: "a chat turn", cards: [], stopNote: undefined, expected: "false" },
  ])("passes the step-budget note on $label (stopNote $stopNote)", ({ cards, stopNote, expected }) => {
    const run = { ...makeRun("r1", "success"), cards, templateFields: sampleFields, stopNote };
    mountRenderer({ r1: run });

    expect(screen.getByTestId("status-success").getAttribute("data-step-budget")).toBe(expected);
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

  it("renders thinking activity on a streaming chat message without pending", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      toolCalls: [{ kind: "reasoning" as const, id: "r1-reasoning-0", text: "plan", status: "running" as const }],
    };
    mountRenderer({ r1: run }, { assistantText: "" });
    expect(screen.getByTestId("tool-activity").textContent).toBe("thinking");
    expect(screen.getByTestId("tool-activity").getAttribute("data-has-render-text")).toBe("true");
    expect(screen.queryByTestId("status-pending")).toBeNull();
  });

  it("shows pending after settled tools when the stream still has no text", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      toolCalls: [{ id: "call-1", name: "list_decks", input: {}, status: "success" as const, output: { decks: [] } }],
    };
    mountRenderer({ r1: run }, { assistantText: "", activeRunId: "r1" });
    const tool = screen.getByTestId("tool-activity");
    const pending = screen.getByTestId("status-pending");
    expect(tool.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows pending after settled thinking when the stream still has no text", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      toolCalls: [{ kind: "reasoning" as const, id: "r1-reasoning-0", text: "plan", status: "done" as const }],
    };
    mountRenderer({ r1: run }, { assistantText: "", activeRunId: "r1" });
    const tool = screen.getByTestId("tool-activity");
    const pending = screen.getByTestId("status-pending");
    expect(tool.textContent).toBe("thinking");
    expect(tool.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
          output: { decks: [{ deckId: testId(1) }] },
        },
      ],
    };
    mountRenderer({ r1: run });
    expect(screen.getByTestId("tool-activity").textContent).toBe("list_decks");
    expect(screen.getByTestId("status-success")).toBeTruthy();
  });

  it("renders leftover text below the cards table on a chat proposal", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
    };
    mountRenderer({ r1: run });
    const table = screen.getByTestId("cards-table");
    const note = screen.getByText("Hello");
    expect(table.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const success = screen.getByTestId("status-success");
    expect(success).toBeTruthy();
    expect(note.compareDocumentPosition(success) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders tools, then the cards table, then leftover text", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
      toolCalls: [
        {
          id: "call-1",
          name: "propose_cards",
          input: {},
          status: "success" as const,
          output: { cards: [sampleCard] },
        },
      ],
    };
    mountRenderer({ r1: run });
    const tool = screen.getByTestId("tool-activity");
    const table = screen.getByTestId("cards-table");
    const note = screen.getByText("Hello");
    expect(tool.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("status-success")).toBeTruthy();
  });

  it("attaches pending below the table until leftover text arrives", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
    };
    mountRenderer({ r1: run }, { assistantText: "", activeRunId: "r1" });
    const table = screen.getByTestId("cards-table");
    const pending = screen.getByTestId("status-pending");
    expect(screen.queryByText("Hello")).toBeNull();
    expect(table.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides pending on a card turn while a tool is still running", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
      toolCalls: [{ id: "call-1", name: "propose_cards", input: {}, status: "running" as const }],
    };
    mountRenderer({ r1: run }, { assistantText: "", activeRunId: "r1" });
    expect(screen.getByTestId("cards-table")).toBeTruthy();
    expect(screen.getByTestId("tool-activity").textContent).toBe("propose_cards");
    expect(screen.queryByTestId("status-pending")).toBeNull();
  });

  it("drops pending once leftover text is streaming below the table", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
    };
    mountRenderer({ r1: run }, { activeRunId: "r1" });
    const table = screen.getByTestId("cards-table");
    const note = screen.getByText("Hello");
    expect(screen.queryByTestId("status-pending")).toBeNull();
    expect(table.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not enable add without writeTargetDeckId on a chat proposal", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard],
      templateFields: sampleFields,
    };
    mountRenderer({ r1: run });
    const table = screen.getByTestId("cards-table");
    expect(table.getAttribute("data-can-add")).toBe("false");
    expect(table.getAttribute("data-deck-id")).toBe("null");
    expect(table.getAttribute("data-template-id")).toBe("undefined");
  });

  it("does not enable add without writeTargetTemplateId on a chat proposal", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
    };
    mountRenderer({ r1: run });
    const table = screen.getByTestId("cards-table");
    expect(table.getAttribute("data-can-add")).toBe("false");
    expect(table.getAttribute("data-deck-id")).toBe(testId(5));
    expect(table.getAttribute("data-template-id")).toBe("undefined");
  });

  it("enables add against write-target deck and template, not the picker", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
      writeTargetTemplateId: testId(3),
    };
    mountRenderer({ r1: run });
    const table = screen.getByTestId("cards-table");
    expect(table.getAttribute("data-can-add")).toBe("true");
    expect(table.getAttribute("data-deck-id")).toBe(testId(5));
    expect(table.getAttribute("data-template-id")).toBe(testId(3));
  });

  it("copies cards serialized before leftover text on a chat proposal", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard, sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
    };
    mountRenderer({ r1: run });
    expect(screen.getByTestId("copy-button").getAttribute("data-text")).toBe(
      ["## Card 1", "**Front**: Q", "**Back**: A", "", "## Card 2", "**Front**: Q", "**Back**: A", "", "Hello"].join(
        "\n",
      ),
    );
  });

  it("copies serialized cards on a cards-only message", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: testId(5),
    };
    mountRenderer({ r1: run }, { assistantText: "" });
    expect(screen.getByTestId("copy-button").getAttribute("data-text")).toBe(
      ["## Card 1", "**Front**: Q", "**Back**: A"].join("\n"),
    );
  });

  it("copies only text on a chat message without cards", () => {
    mountRenderer({ r1: makeRun("r1", "success") });
    expect(screen.getByTestId("copy-button").getAttribute("data-text")).toBe("Hello");
  });

  it("copies only text when the template fields are unavailable", () => {
    const run = { ...makeRun("r1", "success"), cards: [sampleCard], templateFields: null };
    mountRenderer({ r1: run });
    expect(screen.getByTestId("copy-button").getAttribute("data-text")).toBe("Hello");
  });

  it("keeps renderMessage identity when handleRevert is stable", () => {
    const conversationId = "c1";
    const store = createStore();
    store.set(currentConversationIdAtom, conversationId);
    store.set(conversationsAtom, {
      [conversationId]: { ...initialConversationState, id: conversationId },
    });
    const Wrapper = ({ children }: PropsWithChildren) => <JotaiProvider store={store}>{children}</JotaiProvider>;
    const handleRetry = vi.fn();
    const handleRevert = vi.fn();
    const { result, rerender } = renderHook(() => useAssistantMessageRenderer({ handleRetry, handleRevert }), {
      wrapper: Wrapper,
    });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("re-renders only the streaming tail on keystrokes and chunks, not finished turns", () => {
    const conversationId = "c1";
    const store = createStore();
    store.set(currentConversationIdAtom, conversationId);
    store.set(conversationsAtom, {
      [conversationId]: {
        ...initialConversationState,
        id: conversationId,
        activeRunId: "r2",
        messages: [
          createTextMessage("user-r1", "user", "Make cards", { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" }),
          createTextMessage(assistantMessageId("r1"), "assistant", "Done", { kind: "chat-text", runId: "r1" }),
          createTextMessage("user-r2", "user", "More", { createdAt: "2026-07-01T11:01:00.000Z", runId: "r2" }),
          createTextMessage(assistantMessageId("r2"), "assistant", "", { kind: "chat-text", runId: "r2" }),
        ],
        runs: {
          r1: {
            ...makeRun("r1", "success"),
            cards: [sampleCard],
            templateFields: sampleFields,
            toolCalls: [
              {
                id: "r1-call",
                name: "propose_cards",
                input: {},
                status: "success" as const,
                output: { cards: [sampleCard] },
                startedAt: new Date(0),
                elapsedSeconds: 1,
              },
            ],
          },
          r2: makeRun("r2", "streaming"),
        },
      },
    });
    const handleRetry = vi.fn();
    const handleRevert = vi.fn();

    // Stands in for AIChatMessages: the chat shell re-renders it on every keystroke.
    // User rows are left out; their send time needs a locale this file does not set up.
    function Transcript(_props: { promptInput: string }) {
      const messages = useAtomValue(assistantMessagesAtom);
      const renderMessage = useAssistantMessageRenderer({ handleRetry, handleRevert });
      return (
        <>
          {messages
            .filter((message) => message.role === "assistant")
            .map((message) => (
              <React.Fragment key={message.id}>
                {renderMessage(message, <p>{getTextMessageContent(message)}</p>)}
              </React.Fragment>
            ))}
        </>
      );
    }
    const Wrapper = ({ children }: PropsWithChildren) => <JotaiProvider store={store}>{children}</JotaiProvider>;
    const { rerender } = render(<Transcript promptInput="" />, { wrapper: Wrapper });

    for (const promptInput of ["a", "ab", "abc", "abcd", "abcde"]) {
      rerender(<Transcript promptInput={promptInput} />);
    }
    for (const text of ["You", "You have", "You have 2", "You have 2 decks", "You have 2 decks."]) {
      act(() => {
        store.set(assistantConversationStateAtom, ["updateAssistantText", { runId: "r2", text }]);
      });
    }

    expect(screen.getByText("You have 2 decks.")).toBeTruthy();
    expect(stubRenders.mock.calls.filter(([, key]) => key === "r1-call")).toHaveLength(1);
    expect(stubRenders.mock.calls.filter(([, key]) => key === "r1")).toHaveLength(1);
  });
});
