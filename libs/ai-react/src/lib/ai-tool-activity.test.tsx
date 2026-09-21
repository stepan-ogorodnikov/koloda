import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIToolActivity } from "./ai-tool-activity";
import type { AIToolCallRecord } from "./ai-tool-activity";

const plural = vi.hoisted(() => vi.fn((_count: number, forms: { other: string }) => forms.other));

vi.mock("@lingui/core/macro", async (importOriginal) => ({
  ...(await importOriginal()),
  plural,
}));

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

  it("renders a list_templates success row from the templates array length", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "list_templates",
            status: "success",
            output: { templates: [{ templateId: 1 }, { templateId: 2 }] },
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.list-templates")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.templates")).toBeTruthy();
    expect(activityDots(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-templates/ }))).toHaveLength(
      1,
    );
    expect(screen.queryByLabelText("ai.chat.tool-activity.running")).toBeNull();
    expect(screen.queryByLabelText("ai.chat.tool-activity.failed")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("renders a list_algorithms success row from the algorithms array length", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "list_algorithms",
            status: "success",
            output: { algorithms: [{ algorithmId: 1 }, { algorithmId: 2 }] },
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.list-algorithms")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.algorithms")).toBeTruthy();
    expect(activityDots(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.list-algorithms/ }))).toHaveLength(
      1,
    );
    expect(screen.queryByLabelText("ai.chat.tool-activity.running")).toBeNull();
    expect(screen.queryByLabelText("ai.chat.tool-activity.failed")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("renders an add_deck success row with the deck title", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "add_deck",
            status: "success",
            input: { title: "Spanish", templateId: "01900000-0000-7000-8000-000000000005" },
            output: {
              deckId: "01900000-0000-7000-8000-000000000099",
              title: "Spanish",
              templateId: "01900000-0000-7000-8000-000000000005",
              templateTitle: "Basic",
              fieldTitles: ["Front", "Back"],
              algorithmId: "01900000-0000-7000-8000-000000000031",
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.add-deck")).toBeTruthy();
    expect(screen.getByText("Spanish")).toBeTruthy();
    expect(activityDots(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.add-deck/ }))).toHaveLength(1);
    expect(screen.queryByLabelText("ai.chat.tool-activity.failed")).toBeNull();
  });

  it("marks a failed add_deck row", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "add_deck",
            status: "error",
            input: { title: "Spanish", templateId: "01900000-0000-7000-8000-000000000194" },
            error: "Template not found: 01900000-0000-7000-8000-000000000194",
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.add-deck")).toBeTruthy();
    expect(screen.getByLabelText("ai.chat.tool-activity.failed")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.failed")).toBeTruthy();
  });

  it("renders a get_deck success row with the deck title", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "get_deck",
            status: "success",
            input: { deckId: "01900000-0000-7000-8000-000000000001" },
            output: {
              deckId: "01900000-0000-7000-8000-000000000001",
              title: "Spanish",
              cardCount: 3,
              templateTitle: "Basic",
              fieldTitles: ["Front", "Back"],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.get-deck")).toBeTruthy();
    expect(screen.getByText("Spanish")).toBeTruthy();
    expect(activityDots(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.get-deck/ }))).toHaveLength(1);
    expect(screen.queryByLabelText("ai.chat.tool-activity.running")).toBeNull();
    expect(screen.queryByLabelText("ai.chat.tool-activity.failed")).toBeNull();
  });

  it("renders a get_template success row with the template title", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "get_template",
            status: "success",
            input: { templateId: "01900000-0000-7000-8000-000000000005" },
            output: {
              templateId: "01900000-0000-7000-8000-000000000005",
              title: "Basic",
              fields: [
                { id: "a", title: "Front", type: "text", isRequired: true },
                { id: "b", title: "Back", type: "text", isRequired: true },
              ],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.get-template")).toBeTruthy();
    expect(screen.getByText("Basic")).toBeTruthy();
    expect(activityDots(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.get-template/ }))).toHaveLength(1);
    expect(screen.queryByLabelText("ai.chat.tool-activity.running")).toBeNull();
    expect(screen.queryByLabelText("ai.chat.tool-activity.failed")).toBeNull();
  });

  it.each([
    {
      scenario: "full output",
      output: { totalCards: 40, cards: [{ fields: {} }, { fields: {} }], acceptedCount: 9 },
      count: 2,
    },
    { scenario: "card cap", output: { isTruncated: true, totalCards: 300, acceptedCount: 200 }, count: 200 },
    { scenario: "character budget", output: { isTruncated: true, totalCards: 40, acceptedCount: 2 }, count: 2 },
    { scenario: "empty result", output: { isTruncated: true, totalCards: 40, acceptedCount: 0 }, count: 0 },
    { scenario: "unknown returned count", output: { isTruncated: true, totalCards: 40 }, count: null },
  ])("uses the returned card count for $scenario", ({ output, count }) => {
    plural.mockClear();
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "get_deck_cards",
            status: "success",
            input: { deckId: 9 },
            output,
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.get-deck-cards")).toBeTruthy();
    const expectedCalls = count === null ? [] : [[count, { other: "ai.chat.tool-activity.cards" }]];
    expect(plural.mock.calls).toEqual(expectedCalls);
    expect(screen.queryByText("ai.chat.tool-activity.cards") !== null).toBe(count !== null);
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
    expect(screen.queryByText("ai.chat.tool-activity.skipped")).toBeNull();
  });

  it("renders skipped cards after a dot when propose_cards drops some", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "propose_cards",
            status: "success",
            input: { deckId: 5, cards: [] },
            output: { cards: [{ fields: {} }, { fields: {} }, { fields: {} }], rejectedCount: 2 },
          }),
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.propose-cards/ });
    expect(screen.getByText("ai.chat.tool-activity.cards")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.skipped")).toBeTruthy();
    expect(activityDots(trigger)).toHaveLength(2);
  });

  it("omits skipped when propose_cards rejectedCount is zero", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "propose_cards",
            status: "success",
            output: { cards: [{ fields: {} }], rejectedCount: 0 },
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.cards")).toBeTruthy();
    expect(screen.queryByText("ai.chat.tool-activity.skipped")).toBeNull();
  });

  it("renders accepted and skipped counts from a truncated propose_cards output", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "propose_cards",
            status: "success",
            output: { isTruncated: true, itemCount: 7, acceptedCount: 8, rejectedCount: 2, preview: '{"cards":[' },
          }),
        ]}
      />,
    );

    expect(screen.getByText("ai.chat.tool-activity.cards")).toBeTruthy();
    expect(screen.getByText("ai.chat.tool-activity.skipped")).toBeTruthy();
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

  it("expands a truncated input as the preview, not the wrapper object", () => {
    render(
      <AIToolActivity
        calls={[
          call({
            id: "c1",
            name: "propose_cards",
            status: "running",
            input: { isTruncated: true, itemCount: 2, preview: '{"deckId":1,"cards":[{' },
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.propose-cards/ }));
    expect(screen.getByText("ai.chat.tool-activity.input-truncated")).toBeTruthy();
    expect(screen.getByText('{"deckId":1,"cards":[{')).toBeTruthy();
    expect(screen.queryByText(/isTruncated/)).toBeNull();
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
    fireEvent.click(reasoningTrigger);
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

  it("keeps thinking collapsed while running and after it finishes", () => {
    const { rerender } = render(
      <AIToolActivity calls={[{ kind: "reasoning", id: "r1", text: "Quiet plan.", status: "running" }]} />,
    );

    const thinkingTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thinking/ });
    expect(thinkingTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("ai.chat.tool-activity.thinking")).toBeTruthy();
    expect(screen.getByLabelText("ai.chat.tool-activity.running")).toBeTruthy();
    expect(screen.queryByText("Quiet plan.")).toBeNull();

    fireEvent.click(thinkingTrigger);
    expect(thinkingTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Quiet plan.")).toBeTruthy();

    rerender(<AIToolActivity calls={[{ kind: "reasoning", id: "r1", text: "Quiet plan.", status: "done" }]} />);

    const thoughtTrigger = screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thought/ });
    expect(thoughtTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Quiet plan.")).toBeTruthy();

    fireEvent.click(thoughtTrigger);
    expect(thoughtTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Quiet plan.")).toBeNull();
  });

  it("uses renderText for reasoning when provided", () => {
    render(
      <AIToolActivity
        renderText={(text) => <div data-testid="custom-reasoning">{text}</div>}
        calls={[{ kind: "reasoning", id: "r1", text: "**plan**", status: "running" }]}
      />,
    );

    expect(screen.queryByTestId("custom-reasoning")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ai\.chat\.tool-activity\.thinking/ }));
    expect(screen.getByTestId("custom-reasoning").textContent).toBe("**plan**");
  });

  it("renders nothing when there are no calls", () => {
    const { container } = render(<AIToolActivity calls={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
