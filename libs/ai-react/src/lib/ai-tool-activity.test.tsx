import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AIToolActivity } from "./ai-tool-activity";
import type { AIToolCallRecord } from "./ai-tool-activity";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

function call(
  overrides: Partial<AIToolCallRecord> & Pick<AIToolCallRecord, "id" | "name" | "status">,
): AIToolCallRecord {
  return {
    input: {},
    ...overrides,
  };
}

describe("AIToolActivity", () => {
  it("renders a list_decks success row from the decks array length", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "list_decks",
            status: "success",
            output: { decks: [{ deckId: 1 }, { deckId: 2 }, { deckId: 3 }] },
          }),
        ]}
      />,
    );

    expect(screen.getByText("list_decks — ai.chat.tool-activity.decks 3")).toBeTruthy();
  });

  it("renders a get_deck_cards success row from the returned cards length", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "get_deck_cards",
            status: "success",
            input: { deckId: 9 },
            output: { deckTitle: "Spanish", totalCards: 40, isCapped: true, cards: [{ fields: {} }, { fields: {} }] },
          }),
        ]}
      />,
    );

    expect(screen.getByText("get_deck_cards — ai.chat.tool-activity.cards 2")).toBeTruthy();
  });

  it("shows a live spinner while a call is running", () => {
    render(<AIToolActivity calls={[call({ id: "c1", name: "list_decks", status: "running", input: {} })]} />);

    expect(screen.getByLabelText("ai.chat.tool-activity.running")).toBeTruthy();
    expect(screen.getByText("list_decks")).toBeTruthy();
  });

  it("marks an error status on the row", () => {
    render(
      <AIToolActivity
        calls={[call({ id: "c1", name: "list_decks", status: "error", input: {}, error: { message: "boom" } })]}
      />,
    );

    expect(screen.getByLabelText("ai.chat.tool-activity.failed")).toBeTruthy();
    expect(screen.getByText("list_decks — ai.chat.tool-activity.failed")).toBeTruthy();
  });

  it("expands input and output for inspection", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "get_deck_cards",
            status: "success",
            input: { deckId: 9 },
            output: { cards: [] },
          }),
        ]}
      />,
    );

    const details = document.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    fireEvent.click(screen.getByText("get_deck_cards — ai.chat.tool-activity.cards 0"));
    expect(details!.open).toBe(true);
    expect(screen.getByText("ai.chat.tool-activity.input")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.output")).toBeTruthy();
    expect(screen.getByText(/"deckId": 9/)).toBeTruthy();
  });

  it("renders nothing when there are no calls", () => {
    const { container } = render(<AIToolActivity calls={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
