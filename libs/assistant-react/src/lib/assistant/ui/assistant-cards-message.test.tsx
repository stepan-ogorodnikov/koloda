import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { Template } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AssistantCardsMessage } from "./assistant-cards-message";
import { testId } from "../../../test/test-helpers";

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
  AssistantCardsTable: ({ cards, isTemplateUnavailable }: { cards: unknown[]; isTemplateUnavailable?: boolean }) => (
    <div data-testid="cards-table" data-unavailable={String(!!isTemplateUnavailable)}>
      {isTemplateUnavailable ? <span>assistant.template-unavailable</span> : null}
      {cards.length} cards
    </div>
  ),
}));

const template = {
  id: testId(1),
  title: "T",
  content: {
    fields: [{ id: testId(1), title: "Front", type: "text", isRequired: true }],
    layout: [{ field: testId(1), operation: "display" as const }],
  },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isLocked: false,
} as Template;

const baseProps = {
  runId: "r1",
  cards: [{ content: { [testId(1)]: { text: "Front A" } } }],
  cardStatuses: { 0: "idle" as const },
  template,
  deckId: testId(1),
  templateId: testId(1),
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

function buildQueries(liveTemplate: Template | null): Queries {
  return {
    getTemplateQuery: (id: Template["id"]) => ({
      queryKey: queryKeys.templates.detail(id),
      queryFn: async () => (id === template.id ? liveTemplate : null),
    }),
  } as unknown as Queries;
}

function renderMessage(
  props: Partial<React.ComponentProps<typeof AssistantCardsMessage>> = {},
  liveTemplate: Template | null = template,
) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries(liveTemplate));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
  return render(<AssistantCardsMessage {...baseProps} {...props} />, { wrapper });
}

describe("AssistantCardsMessage", () => {
  it.each([
    { label: "failed", props: { isFailed: true } },
    { label: "canceled", props: { isCanceled: true } },
    { label: "interrupted", props: { isInterrupted: true } },
  ])("keeps partial cards visible for $label runs and exposes retry", ({ label, props }) => {
    const onRetry = vi.fn();
    renderMessage({ ...props, onRetry });

    expect(screen.getByTestId("cards-table").textContent).toBe("1 cards");
    expect(screen.getByTestId(`status-${label}`)).toBeTruthy();
    screen.getByRole("button", { name: "retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("hides run status when embedded under leftover chat text", () => {
    renderMessage({ isGenerating: true, showStatus: false, elapsedSeconds: undefined });

    expect(screen.getByTestId("cards-table")).toBeTruthy();
    expect(screen.queryByTestId("status-pending")).toBeNull();
    expect(screen.queryByTestId("status-success")).toBeNull();
  });

  it("hides the cards table when there are no cards on a failed run", () => {
    renderMessage({ cards: [], isFailed: true, canRetry: false });

    expect(screen.queryByTestId("cards-table")).toBeNull();
    expect(screen.getByTestId("status-failed")).toBeTruthy();
  });

  it.each([
    { label: "canceled", props: { isCanceled: true } },
    { label: "interrupted", props: { isInterrupted: true } },
  ])("shows $label status and retry when elapsedSeconds is missing", ({ label, props }) => {
    const onRetry = vi.fn();
    renderMessage({ ...props, elapsedSeconds: undefined, onRetry });

    expect(screen.getByTestId(`status-${label}`)).toBeTruthy();
    screen.getByRole("button", { name: "retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps the snapshot table and marks the template unavailable when the write target is gone", async () => {
    renderMessage({}, null);

    await waitFor(() => {
      expect(screen.getByText("assistant.template-unavailable")).toBeTruthy();
    });
    expect(screen.getByTestId("cards-table").getAttribute("data-unavailable")).toBe("true");
    expect(screen.getByTestId("cards-table").textContent).toContain("1 cards");
  });

  it("does not mark the template unavailable when the write target still exists", async () => {
    renderMessage();

    expect(screen.getByTestId("cards-table")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText("assistant.template-unavailable")).toBeNull();
    });
  });

  it("does not mark unavailable when the run has no write-target template id", async () => {
    renderMessage({ templateId: undefined }, null);

    expect(screen.getByTestId("cards-table")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText("assistant.template-unavailable")).toBeNull();
    });
  });
});
