import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function foldChevron(trigger: HTMLElement) {
  const svgs = [...trigger.querySelectorAll("svg")];
  return svgs.find((svg) => [...svg.classList].some((name) => name.includes("rotate-90"))) ?? null;
}

function activityDots(trigger: HTMLElement) {
  return [...trigger.querySelectorAll('[aria-hidden="true"]')].filter((el) => el.textContent === "·");
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

    expect(screen.getByText("ai.chat.tool-activity.list-decks")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.decks")).toBeTruthy();
    expect(activityDots(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-decks/ }))).toHaveLength(1);
    expect(screen.queryByLabelText("ai.chat.tool-activity.running")).toBeNull();
    expect(screen.queryByLabelText("ai.chat.tool-activity.failed")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
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

    expect(screen.getByText("ai.chat.tool-activity.get-deck-cards")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.cards")).toBeTruthy();
  });

  it("renders a propose_cards success row from the cards array length", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "propose_cards",
            status: "success",
            input: { deckId: 5, cards: [] },
            output: { cards: [{ fields: {} }, { fields: {} }, { fields: {} }] },
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.propose-cards")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.cards")).toBeTruthy();
  });

  it("shimmers the tool row while a call is running", () => {
    const { container } = render(
      <AIToolActivity calls={[call({ id: "c1", name: "list_decks", status: "running", input: {} })]} />,
    );

    expect(screen.getByLabelText("ai.chat.tool-activity.running")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.list-decks")).toBeTruthy();
    expect(container.querySelector(".animate-shimmer")).not.toBeNull();
  });

  it("marks an error status on the row", () => {
    render(
      <AIToolActivity
        calls={[call({ id: "c1", name: "list_decks", status: "error", input: {}, error: { message: "boom" } })]}
      />,
    );

    expect(screen.getByLabelText("ai.chat.tool-activity.failed")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.list-decks")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.failed")).toBeTruthy();
  });

  it("renders an unknown tool by protocol id", () => {
    render(
      <AIToolActivity calls={[call({ id: "c1", name: "search_cards", status: "success", input: { q: "hola" } })]} />,
    );

    expect(screen.getAllByText("search_cards").length).toBeGreaterThan(0);
    expect(screen.queryByText("ai.chat.tool-activity.list-decks")).toBeNull();
  });

  it("expands input and output below the row and collapses on a second press", () => {
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

    const trigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.get-deck-cards/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("ai.chat.tool-activity.input")).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("ai.chat.tool-activity.tool")).toBeTruthy();
    expect(screen.getByText("get_deck_cards")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.input")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.output")).toBeTruthy();
    expect(screen.getByText(/"deckId": 9/)).toBeTruthy();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("ai.chat.tool-activity.input")).toBeNull();
  });

  it("puts a fold chevron after the label", () => {
    render(
      <AIToolActivity
        calls={[
          { kind: "reasoning", id: "r1", text: "Quiet plan.", status: "running" },
          call({ id: "c1", name: "list_decks", status: "success", output: { decks: [] } }),
        ]}
      />,
    );

    const reasoningTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thinking/ });
    const toolTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-decks/ });
    expect(foldChevron(reasoningTrigger)).not.toBeNull();
    expect(foldChevron(toolTrigger)).not.toBeNull();
  });

  describe("activity elapsed time", () => {
    const startedAt = new Date("2026-07-01T12:00:00.000Z");

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows a live timer after a dot while a row is running", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T12:00:30.000Z"));

      render(
        <AIToolActivity
          calls={[
            {
              kind: "reasoning",
              id: "r1",
              text: "Quiet plan.",
              status: "running",
              startedAt,
              elapsedSeconds: null,
            },
            call({
              id: "c1",
              name: "list_decks",
              status: "running",
              startedAt,
              elapsedSeconds: null,
            }),
          ]}
        />,
      );

      const reasoningTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thinking/ });
      const toolTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-decks/ });
      expect(activityDots(reasoningTrigger)).toHaveLength(1);
      expect(activityDots(toolTrigger)).toHaveLength(1);
      expect(reasoningTrigger.textContent).toContain("30");
      expect(toolTrigger.textContent).toContain("30");
    });

    it("shows a frozen elapsed time after a dot when a row is done", () => {
      render(
        <AIToolActivity
          calls={[
            {
              kind: "reasoning",
              id: "r1",
              text: "Quiet plan.",
              status: "done",
              startedAt,
              elapsedSeconds: 4,
            },
            call({
              id: "c1",
              name: "list_decks",
              status: "success",
              output: { decks: [] },
              startedAt,
              elapsedSeconds: 5,
            }),
          ]}
        />,
      );

      const reasoningTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thought/ });
      const toolTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-decks/ });
      expect(activityDots(reasoningTrigger)).toHaveLength(1);
      expect(activityDots(toolTrigger)).toHaveLength(2);
      expect(reasoningTrigger.textContent).toMatch(/4/);
      expect(toolTrigger.textContent).toMatch(/5/);
    });

    it("hides the timer and separator when timestamps are missing", () => {
      render(
        <AIToolActivity
          calls={[
            { kind: "reasoning", id: "r1", text: "Quiet plan.", status: "done" },
            call({ id: "c1", name: "search_cards", status: "success", input: { q: "hola" } }),
          ]}
        />,
      );

      const reasoningTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thought/ });
      const toolTrigger = screen.getByRole("button", { name: /search_cards/ });
      expect(activityDots(reasoningTrigger)).toHaveLength(0);
      expect(activityDots(toolTrigger)).toHaveLength(0);
    });

    it("hides a frozen elapsed time under one second", () => {
      render(
        <AIToolActivity
          calls={[
            {
              kind: "reasoning",
              id: "r1",
              text: "Quiet plan.",
              status: "done",
              startedAt,
              elapsedSeconds: 0,
            },
            call({
              id: "c1",
              name: "list_decks",
              status: "success",
              output: { decks: [] },
              startedAt,
              elapsedSeconds: 0,
            }),
          ]}
        />,
      );

      const reasoningTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thought/ });
      const toolTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-decks/ });
      expect(activityDots(reasoningTrigger)).toHaveLength(0);
      expect(activityDots(toolTrigger)).toHaveLength(1);
      expect(screen.queryByText("ai.chat.elapsed-time.periods.seconds")).toBeNull();
    });

    it("waits until one second has elapsed before showing a live timer", () => {
      vi.useFakeTimers();
      vi.setSystemTime(startedAt);

      render(
        <AIToolActivity
          calls={[
            {
              kind: "reasoning",
              id: "r1",
              text: "Quiet plan.",
              status: "running",
              startedAt,
              elapsedSeconds: null,
            },
            call({
              id: "c1",
              name: "search_cards",
              status: "running",
              startedAt,
              elapsedSeconds: null,
            }),
          ]}
        />,
      );

      const reasoningTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thinking/ });
      const toolTrigger = screen.getByRole("button", { name: /search_cards/ });
      expect(activityDots(reasoningTrigger)).toHaveLength(0);
      expect(activityDots(toolTrigger)).toHaveLength(0);
      expect(screen.queryByText("ai.chat.elapsed-time.periods.seconds")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(activityDots(reasoningTrigger)).toHaveLength(1);
      expect(activityDots(toolTrigger)).toHaveLength(1);
      expect(screen.getAllByText("ai.chat.elapsed-time.periods.seconds")).toHaveLength(2);
    });
  });

  it("frames the disclosed tool payload and leaves the row and reasoning unframed", () => {
    render(
      <AIToolActivity
        calls={[
          { kind: "reasoning", id: "r1", text: "Quiet plan.", status: "running" },
          call({ id: "c1", name: "list_decks", status: "success", output: { decks: [] } }),
        ]}
      />,
    );

    const reasoningTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thinking/ });
    const toolTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-decks/ });
    expect(toolTrigger.closest("li")?.className).not.toContain("border-main");
    expect(reasoningTrigger.closest("li")?.className).not.toContain("border-main");
    expect(screen.getByText("Quiet plan.").className).not.toContain("border-main");

    fireEvent.click(toolTrigger);
    expect(screen.getByText("ai.chat.tool-activity.input").closest(".border-main")).not.toBeNull();
  });

  it("keeps a running tool row collapsed until opened", () => {
    render(<AIToolActivity calls={[call({ id: "c1", name: "list_decks", status: "running", input: { q: 1 } })]} />);

    expect(screen.queryByText("ai.chat.tool-activity.input")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-decks/ }));
    expect(screen.getByText("ai.chat.tool-activity.input")).toBeTruthy();
    expect(screen.getByText(/"q": 1/)).toBeTruthy();
  });

  it("streams thinking inline and auto-collapses when done", () => {
    const { container, rerender } = render(
      <AIToolActivity calls={[{ kind: "reasoning", id: "r1", text: "Quiet plan.", status: "running" }]} />,
    );

    expect(screen.getByText("ai.chat.tool-activity.thinking")).toBeTruthy();
    expect(screen.getByLabelText("ai.chat.tool-activity.running")).toBeTruthy();
    expect(screen.getByText("Quiet plan.")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.thinking").className).toContain(
      "animate-shimmer-text--fg-level-4/fg-level-1",
    );
    expect(container.querySelector(".animate-shimmer")).toBeNull();

    rerender(<AIToolActivity calls={[{ kind: "reasoning", id: "r1", text: "Quiet plan.", status: "done" }]} />);

    expect(screen.getByText("ai.chat.tool-activity.thought")).toBeTruthy();
    expect(screen.queryByText("Quiet plan.")).toBeNull();
    expect(screen.getByText("ai.chat.tool-activity.thought").className).not.toContain(
      "animate-shimmer-text--fg-level-4/fg-level-1",
    );

    fireEvent.click(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thought/ }));
    expect(screen.getByText("Quiet plan.")).toBeTruthy();
  });

  it("uses renderText for reasoning when provided", () => {
    render(
      <AIToolActivity
        renderText={(text) => <div data-testid="custom-reasoning">{text}</div>}
        calls={[{ kind: "reasoning", id: "r1", text: "**plan**", status: "running" }]}
      />,
    );

    expect(screen.getByTestId("custom-reasoning").textContent).toBe("**plan**");
  });

  it("renders nothing when there are no calls", () => {
    const { container } = render(<AIToolActivity calls={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
