import { Label, TextField } from "@koloda/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

function mockTextAreaMetrics(textarea: HTMLTextAreaElement, scrollHeight: number) {
  Object.defineProperty(textarea, "scrollHeight", { configurable: true, get: () => scrollHeight });
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    borderBottomWidth: "0px",
    borderTopWidth: "0px",
    fontSize: "16px",
    lineHeight: "20px",
    maxHeight: "none",
    minHeight: "0px",
    paddingBottom: "8px",
    paddingTop: "8px",
  } as CSSStyleDeclaration);
}

describe("TextField", () => {
  it("fires onChange when typing into the input", () => {
    const onChange = vi.fn();

    render(
      <TextField aria-label="Name" onChange={onChange}>
        <TextField.Input />
      </TextField>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Koloda" } });

    expect(onChange).toHaveBeenCalledWith("Koloda");
  });

  it("supports controlled textarea values", () => {
    function Controlled() {
      const [value, setValue] = useState("");
      return (
        <TextField aria-label="Notes" value={value} onChange={setValue}>
          <TextField.TextArea />
        </TextField>
      );
    }

    render(<Controlled />);
    const textarea = screen.getByRole("textbox", { name: "Notes" });

    fireEvent.change(textarea, { target: { value: "hello" } });

    expect(textarea).toHaveProperty("value", "hello");
  });

  it("marks the field disabled", () => {
    render(
      <TextField aria-label="Locked" isDisabled>
        <TextField.Input />
      </TextField>,
    );

    expect(screen.getByRole("textbox", { name: "Locked" })).toHaveProperty("disabled", true);
  });

  it("marks the field invalid", () => {
    render(
      <TextField isInvalid>
        <Label>Email</Label>
        <TextField.Input />
      </TextField>,
    );

    expect(screen.getByRole("textbox", { name: "Email" }).getAttribute("aria-invalid")).toBe("true");
  });

  it("grows the textarea height to match scrollHeight when under maxRows", () => {
    render(
      <TextField aria-label="Prompt">
        <TextField.TextArea autoResize maxRows={8} />
      </TextField>,
    );

    const textarea = screen.getByRole("textbox", { name: "Prompt" }) as HTMLTextAreaElement;
    mockTextAreaMetrics(textarea, 64);

    fireEvent.input(textarea, { target: { value: "short" } });

    expect(textarea.style.height).toBe("64px");
    expect(textarea.style.overflowY).toBe("hidden");
  });

  it("clamps auto-resize height to maxRows and enables overflow", () => {
    render(
      <TextField aria-label="Prompt">
        <TextField.TextArea autoResize maxRows={4} />
      </TextField>,
    );

    const textarea = screen.getByRole("textbox", { name: "Prompt" }) as HTMLTextAreaElement;
    // maxRows * lineHeight + paddingTop + paddingBottom + borders = 4*20 + 8 + 8 + 0
    mockTextAreaMetrics(textarea, 200);

    fireEvent.input(textarea, { target: { value: "line1\nline2\nline3\nline4\nline5" } });

    expect(textarea.style.height).toBe("96px");
    expect(textarea.style.overflowY).toBe("auto");
  });
});
