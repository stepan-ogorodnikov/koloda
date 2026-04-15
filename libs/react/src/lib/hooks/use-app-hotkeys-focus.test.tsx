import { focusNext, focusPrev, goToNextTab, goToPrevTab, ToggleGroup } from "@koloda/ui";
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

describe("tab navigation hotkeys on toggle groups", () => {
  it("navigates to next item in toggle group", () => {
    render(
      <ToggleGroup aria-label="View options" selectionMode="single">
        <ToggleGroup.Item id="light">Light</ToggleGroup.Item>
        <ToggleGroup.Item id="dark">Dark</ToggleGroup.Item>
        <ToggleGroup.Item id="system">System</ToggleGroup.Item>
      </ToggleGroup>,
    );

    const light = screen.getByRole("radio", { name: "Light" });
    const dark = screen.getByRole("radio", { name: "Dark" });

    light.focus();

    act(() => {
      goToNextTab(createHotkeyEvent());
    });

    expect(document.activeElement).toBe(dark);
  });

  it("navigates to previous item in toggle group", () => {
    render(
      <ToggleGroup aria-label="View options" selectionMode="single">
        <ToggleGroup.Item id="light">Light</ToggleGroup.Item>
        <ToggleGroup.Item id="dark">Dark</ToggleGroup.Item>
        <ToggleGroup.Item id="system">System</ToggleGroup.Item>
      </ToggleGroup>,
    );

    const dark = screen.getByRole("radio", { name: "Dark" });
    const light = screen.getByRole("radio", { name: "Light" });

    dark.focus();

    act(() => {
      goToPrevTab(createHotkeyEvent());
    });

    expect(document.activeElement).toBe(light);
  });

  it("does not wrap when navigating forward from last item in toggle group", () => {
    render(
      <ToggleGroup aria-label="View options" selectionMode="single">
        <ToggleGroup.Item id="light">Light</ToggleGroup.Item>
        <ToggleGroup.Item id="dark">Dark</ToggleGroup.Item>
        <ToggleGroup.Item id="system">System</ToggleGroup.Item>
      </ToggleGroup>,
    );

    const system = screen.getByRole("radio", { name: "System" });

    system.focus();

    act(() => {
      goToNextTab(createHotkeyEvent());
    });

    // Stays on the last item (no wrapping)
    expect(document.activeElement).toBe(system);
  });

  it("does not wrap when navigating backward from first item in toggle group", () => {
    render(
      <ToggleGroup aria-label="View options" selectionMode="single">
        <ToggleGroup.Item id="light">Light</ToggleGroup.Item>
        <ToggleGroup.Item id="dark">Dark</ToggleGroup.Item>
        <ToggleGroup.Item id="system">System</ToggleGroup.Item>
      </ToggleGroup>,
    );

    const light = screen.getByRole("radio", { name: "Light" });

    light.focus();

    act(() => {
      goToPrevTab(createHotkeyEvent());
    });

    // Stays on the first item (no wrapping)
    expect(document.activeElement).toBe(light);
  });
});
