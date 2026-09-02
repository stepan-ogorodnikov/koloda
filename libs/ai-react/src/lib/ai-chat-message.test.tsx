import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AIChatMessage } from "./ai-chat-message";

describe("AIChatMessage", () => {
  it("is memoized so untouched messages skip re-renders on streamed chunks", () => {
    // WHY: the whole list re-rendered per chunk before memoization; the
    // memo contract (shallow props compare against immer-stable parts
    // references) is what keeps non-tail messages from re-rendering.
    expect((AIChatMessage as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });

  it("renders text parts and skips step-start parts", () => {
    render(
      <AIChatMessage
        role="assistant"
        parts={[{ type: "step-start" } as never, { type: "text", text: "Hello world" }]}
      />,
    );
    expect(screen.getByText("Hello world")).toBeDefined();
  });

  it("does not render reasoning parts as message text", () => {
    render(
      <AIChatMessage
        role="assistant"
        parts={[
          { type: "text", text: "Visible answer." },
          { type: "reasoning", text: "Quiet plan." },
        ]}
      />,
    );
    expect(screen.getByText("Visible answer.")).toBeDefined();
    expect(screen.queryByText("Quiet plan.")).toBeNull();
  });

  it("uses renderText for assistant text parts", () => {
    render(
      <AIChatMessage
        role="assistant"
        renderText={(text) => <div data-testid="custom-text">{text}</div>}
        parts={[{ type: "text", text: "**hi**" }]}
      />,
    );
    expect(screen.getByTestId("custom-text").textContent).toBe("**hi**");
  });

  it("keeps user text as a paragraph when renderText is passed", () => {
    render(
      <AIChatMessage
        role="user"
        renderText={(text) => <div data-testid="custom-text">{text}</div>}
        parts={[{ type: "text", text: "**hi**" }]}
      />,
    );
    expect(screen.queryByTestId("custom-text")).toBeNull();
    expect(screen.getByText("**hi**").tagName).toBe("P");
  });
});
