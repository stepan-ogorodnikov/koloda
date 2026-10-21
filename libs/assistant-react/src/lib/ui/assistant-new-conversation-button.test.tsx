import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssistantNewConversationButton } from "./assistant-new-conversation-button";

function newButton() {
  return screen.getByRole("button", { name: "ai.chat.new-conversation.label" }) as HTMLButtonElement;
}

describe("AssistantNewConversationButton", () => {
  it("is enabled whenever the route names a conversation", () => {
    // WHY: The store never makes a conversation that failed to load current, so
    // the route's id is the only signal that the surface is not param-less.
    render(<AssistantNewConversationButton conversationId="draft" onStartNewConversation={vi.fn()} />);

    expect(newButton().disabled).toBe(false);
  });

  it("is disabled on the param-less surface", () => {
    render(<AssistantNewConversationButton conversationId={undefined} onStartNewConversation={vi.fn()} />);

    expect(newButton().disabled).toBe(true);
  });
});
