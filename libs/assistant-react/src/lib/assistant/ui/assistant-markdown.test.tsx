import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistantMarkdown } from "./assistant-markdown";

describe("AssistantMarkdown", () => {
  it("renders headings and emphasis instead of markdown source", () => {
    const { container } = render(<AssistantMarkdown text={"## Title\n\n**bold**"} />);

    expect(container.firstElementChild?.className).toContain("prose-chat");
    expect(screen.getByRole("heading", { level: 2, name: "Title" })).toBeDefined();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.queryByText("## Title")).toBeNull();
  });

  it("does not throw on incomplete streamed markdown", () => {
    expect(() => render(<AssistantMarkdown text={"**bo"} />)).not.toThrow();
  });

  it("applies muted prose for reasoning", () => {
    const { container } = render(<AssistantMarkdown text={"**bold**"} isMuted />);

    expect(container.firstElementChild?.className).toContain("prose-chat-muted");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });
});
