import { focusNext, focusPrev, ToggleGroup } from "@koloda/ui";
import { act, render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";

function createHotkeyEvent() {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
  });
}

function renderFocusableToolbar() {
  render(
    <div>
      <button type="button">Before</button>
      <ToggleGroup aria-label="View options" selectionMode="multiple">
        <ToggleGroup.Item id="light">Light</ToggleGroup.Item>
        <ToggleGroup.Item id="dark">Dark</ToggleGroup.Item>
        <ToggleGroup.Item id="system">System</ToggleGroup.Item>
      </ToggleGroup>
      <button type="button">After</button>
    </div>,
  );

  return {
    before: screen.getByRole("button", { name: "Before" }),
    middle: screen.getByRole("button", { name: "Dark" }),
    after: screen.getByRole("button", { name: "After" }),
  };
}

describe("focus hotkeys", () => {
  it("exits a toggle group when moving focus forward", () => {
    const { middle, after } = renderFocusableToolbar();

    middle.focus();

    act(() => {
      focusNext(createHotkeyEvent());
    });

    expect(document.activeElement).toBe(after);
  });

  it("exits a toggle group when moving focus backward", () => {
    const { before, middle } = renderFocusableToolbar();

    middle.focus();

    act(() => {
      focusPrev(createHotkeyEvent());
    });

    expect(document.activeElement).toBe(before);
  });
});
