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
});
