import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AIChatMessageStatus } from "./ai-chat-message-status";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

vi.mock("@koloda/ui", () => ({
  Button: (props: { children: React.ReactNode }) => <button>{props.children}</button>,
}));

describe("AIChatMessageStatus", () => {
  describe("success state", () => {
    it("renders the modelName and elapsed time when both are provided", () => {
      render(<AIChatMessageStatus state="success" elapsedSeconds={5} modelName="GPT-4" />);

      const status = screen.getByText("GPT-4").parentElement;
      expect(status).not.toBeNull();
      expect(status!.textContent).toContain("GPT-4");
      expect(status!.textContent).toMatch(/5/);
    });

    it("renders the modelName before a dot separator", () => {
      render(<AIChatMessageStatus state="success" elapsedSeconds={5} modelName="GPT-4" />);

      const status = screen.getByText("GPT-4").parentElement;
      const separator = status!.querySelector("[aria-hidden=\"true\"]");
      expect(separator).not.toBeNull();
      expect(separator!.textContent).toBe("·");
    });

    it("hides the modelName and separator when modelName is not provided", () => {
      render(<AIChatMessageStatus state="success" elapsedSeconds={5} />);

      const status = screen.getByText(/5/).parentElement;
      expect(status!.querySelector("[aria-hidden=\"true\"]")).toBeNull();
      expect(status!.textContent).not.toContain("GPT-4");
    });

    it("hides the modelName and separator when modelName is undefined", () => {
      render(
        <AIChatMessageStatus state="success" elapsedSeconds={5} modelName={undefined} />,
      );

      const status = screen.getByText(/5/).parentElement;
      expect(status!.querySelector("[aria-hidden=\"true\"]")).toBeNull();
    });
  });
});
