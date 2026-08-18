import type { Template } from "@koloda/srs";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AssistantCardsMessage } from "./assistant-cards-message";

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
}));

vi.mock("./assistant-cards-table", () => ({
  AssistantCardsTable: ({ cards }: { cards: unknown[] }) => <div data-testid="cards-table">{cards.length} cards</div>,
}));

const template = {
  id: 1,
  title: "T",
  content: {
    fields: [{ id: 1, name: "Front", type: "text" }],
    layout: [{ field: 1, operation: "display" as const }],
  },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isLocked: false,
} as Template;

const baseProps = {
  runId: "r1",
  cards: [{ content: { "1": { text: "Front A" } } }],
  cardStatuses: { 0: "idle" as const },
  template,
  deckId: 1 as const,
  templateId: 1 as const,
  canAdd: false,
  isGenerating: false,
  isCanceled: false,
  isInterrupted: false,
  isFailed: false,
  canRetry: true,
  onRetry: vi.fn(),
  elapsedSeconds: 4,
  startedAt: new Date(1000),
};

describe("AssistantCardsMessage", () => {
  it.each([
    { label: "failed", props: { isFailed: true } },
    { label: "canceled", props: { isCanceled: true } },
    { label: "interrupted", props: { isInterrupted: true } },
  ])("keeps partial cards visible for $label runs and exposes retry", ({ label, props }) => {
    const onRetry = vi.fn();
    render(<AssistantCardsMessage {...baseProps} {...props} onRetry={onRetry} />);

    expect(screen.getByTestId("cards-table").textContent).toBe("1 cards");
    expect(screen.getByTestId(`status-${label}`)).toBeTruthy();
    screen.getByRole("button", { name: "retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("hides run status when embedded under leftover chat text", () => {
    render(<AssistantCardsMessage {...baseProps} isGenerating showStatus={false} elapsedSeconds={undefined} />);

    expect(screen.getByTestId("cards-table")).toBeTruthy();
    expect(screen.queryByTestId("status-pending")).toBeNull();
    expect(screen.queryByTestId("status-success")).toBeNull();
  });

  it("hides the cards table when there are no cards on a failed run", () => {
    render(<AssistantCardsMessage {...baseProps} cards={[]} isFailed canRetry={false} />);

    expect(screen.queryByTestId("cards-table")).toBeNull();
    expect(screen.getByTestId("status-failed")).toBeTruthy();
  });

  it.each([
    { label: "canceled", props: { isCanceled: true } },
    { label: "interrupted", props: { isInterrupted: true } },
  ])("shows $label status and retry when elapsedSeconds is missing", ({ label, props }) => {
    const onRetry = vi.fn();
    render(<AssistantCardsMessage {...baseProps} {...props} elapsedSeconds={undefined} onRetry={onRetry} />);

    expect(screen.getByTestId(`status-${label}`)).toBeTruthy();
    screen.getByRole("button", { name: "retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
