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

vi.mock("./assistant-cards-message", () => ({
  AssistantCardsMessage: (props: {
    canAdd: boolean;
    deckId: number | null;
    templateId: number | undefined;
    isGenerating: boolean;
    showStatus?: boolean;
  }) => (
    <div>
      {props.isGenerating && props.showStatus !== false ? <div data-testid="status-pending" /> : null}
      <div
        data-testid="cards-table"
        data-can-add={String(props.canAdd)}
        data-deck-id={String(props.deckId)}
        data-template-id={String(props.templateId)}
        data-show-status={String(props.showStatus !== false)}
      />
    </div>
  ),
}));

const sampleCard = { content: { "1": { text: "Q" }, "2": { text: "A" } } };
const sampleFields = [
  { id: 1, title: "Front", type: "text" as const, isRequired: true },
  { id: 2, title: "Back", type: "text" as const, isRequired: true },
];

function mountRenderer(
  runs: Record<string, GenerationRun>,
  options: {
    assistantText?: string;
    kind?: "chat-text" | "generated-cards";
    deckId?: number | null;
    templateId?: number;
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
      deckId: options.deckId === undefined ? null : options.deckId,
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
        templateId: options.templateId,
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

  it("renders leftover text below the cards table on a chat proposal", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: 5,
    };
    mountRenderer({ r1: run }, { templateId: 9 });
    const table = screen.getByTestId("cards-table");
    const note = screen.getByText("Hello");
    expect(table.getAttribute("data-show-status")).toBe("false");
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
      writeTargetDeckId: 5,
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
      writeTargetDeckId: 5,
    };
    mountRenderer({ r1: run }, { assistantText: "", activeRunId: "r1" });
    const table = screen.getByTestId("cards-table");
    const pending = screen.getByTestId("status-pending");
    expect(table.getAttribute("data-show-status")).toBe("false");
    expect(screen.queryByText("Hello")).toBeNull();
    expect(table.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("drops pending once leftover text is streaming below the table", () => {
    const run = {
      ...makeRun("r1", "streaming"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: 5,
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
    mountRenderer({ r1: run }, { deckId: 7, templateId: 9 });
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
      writeTargetDeckId: 5,
    };
    mountRenderer({ r1: run }, { deckId: 7, templateId: 9 });
    const table = screen.getByTestId("cards-table");
    expect(table.getAttribute("data-can-add")).toBe("false");
    expect(table.getAttribute("data-deck-id")).toBe("5");
    expect(table.getAttribute("data-template-id")).toBe("undefined");
  });

  it("enables add against write-target deck and template, not the picker", () => {
    const run = {
      ...makeRun("r1", "success"),
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: 5,
      writeTargetTemplateId: 3,
    };
    mountRenderer({ r1: run }, { deckId: 7, templateId: 9 });
    const table = screen.getByTestId("cards-table");
    expect(table.getAttribute("data-can-add")).toBe("true");
    expect(table.getAttribute("data-deck-id")).toBe("5");
    expect(table.getAttribute("data-template-id")).toBe("3");
  });

  it("renders the cards table for old cards-mode messages", () => {
    const run = {
      ...makeRun("r1", "success"),
      mode: "cards" as const,
      cards: [sampleCard],
      templateFields: sampleFields,
    };
    mountRenderer({ r1: run }, { kind: "generated-cards", deckId: 7, templateId: 9 });
    const table = screen.getByTestId("cards-table");
    expect(table).toBeTruthy();
    expect(table.getAttribute("data-can-add")).toBe("true");
    expect(table.getAttribute("data-deck-id")).toBe("7");
    expect(table.getAttribute("data-template-id")).toBe("9");
  });

  it("does not enable add on cards-mode without a conversation template id", () => {
    const run = {
      ...makeRun("r1", "success"),
      mode: "cards" as const,
      cards: [sampleCard],
      templateFields: sampleFields,
    };
    mountRenderer({ r1: run }, { kind: "generated-cards", deckId: 7 });
    const table = screen.getByTestId("cards-table");
    expect(table.getAttribute("data-can-add")).toBe("false");
    expect(table.getAttribute("data-deck-id")).toBe("7");
    expect(table.getAttribute("data-template-id")).toBe("undefined");
  });

  it("renders the cards table for generated-cards when run.mode is chat", () => {
    const run = {
      ...makeRun("r1", "success"),
      mode: "chat" as const,
      cards: [sampleCard],
      templateFields: sampleFields,
      writeTargetDeckId: 5,
      writeTargetTemplateId: 3,
    };
    mountRenderer({ r1: run }, { kind: "generated-cards", deckId: 7, templateId: 9 });
    const table = screen.getByTestId("cards-table");
    expect(table).toBeTruthy();
    expect(table.getAttribute("data-can-add")).toBe("true");
    expect(table.getAttribute("data-deck-id")).toBe("5");
    expect(table.getAttribute("data-template-id")).toBe("3");
  });
});
