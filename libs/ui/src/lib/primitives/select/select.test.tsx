import { fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./select";

type Item = { id: string; name: string };

const ITEMS: Item[] = [
  { id: "alpha", name: "Alpha" },
  { id: "beta", name: "Beta" },
  { id: "gamma", name: "Gamma" },
];

type ControlledSelectProps = {
  items?: Item[];
  searchPlaceholder?: string;
  emptyContent?: string;
  placeholder?: string;
  isDisabled?: boolean;
};

function ControlledSelect({
  items = ITEMS,
  searchPlaceholder,
  emptyContent,
  placeholder = "Pick one",
  isDisabled,
}: ControlledSelectProps) {
  const [value, setValue] = useState<string | null>(null);

  return (
    <Select
      aria-label="Test select"
      items={items}
      value={value}
      onChange={(key) => setValue(key == null ? null : String(key))}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyContent={emptyContent}
      isDisabled={isDisabled}
      isVirtualized={false}
    >
      {(item) => (
        <Select.ListBoxItem id={item.id} textValue={item.name}>
          {item.name}
        </Select.ListBoxItem>
      )}
    </Select>
  );
}

function openSelect(name: RegExp | string) {
  const trigger = screen.getByRole("button", { name });
  fireEvent.click(trigger);
  return trigger;
}

describe("Select", () => {
  it("calls onChange when an option is selected", () => {
    const onChange = vi.fn();

    render(
      <Select
        aria-label="Fruit"
        items={ITEMS}
        value={null}
        onChange={onChange}
        placeholder="Pick"
        isVirtualized={false}
      >
        {(item) => (
          <Select.ListBoxItem id={item.id} textValue={item.name}>
            {item.name}
          </Select.ListBoxItem>
        )}
      </Select>,
    );

    openSelect(/Fruit/);
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));

    expect(onChange).toHaveBeenCalledWith("beta");
  });

  it("shows the selected value on the trigger", () => {
    render(<ControlledSelect />);

    openSelect(/Test select/);
    fireEvent.click(screen.getByRole("option", { name: "Alpha" }));

    expect(screen.getByRole("button", { name: /Alpha/ }).textContent).toContain("Alpha");
  });

  it("filters options with search and restores them when cleared", () => {
    render(<ControlledSelect searchPlaceholder="Search fruits" />);

    openSelect(/Test select/);

    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "gam" } });

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Gamma" })).toBeTruthy();
    expect(within(listbox).queryByRole("option", { name: "Alpha" })).toBeNull();

    fireEvent.change(search, { target: { value: "" } });

    expect(within(listbox).getByRole("option", { name: "Alpha" })).toBeTruthy();
    expect(within(listbox).getByRole("option", { name: "Beta" })).toBeTruthy();
  });

  it("renders emptyContent when items are empty", () => {
    render(<ControlledSelect items={[]} emptyContent="Nothing here" />);

    openSelect(/Test select/);

    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("shows the placeholder when nothing is selected", () => {
    render(<ControlledSelect placeholder="Choose a fruit" />);

    expect(screen.getByRole("button", { name: /Choose a fruit/ }).textContent).toContain("Choose a fruit");
  });

  it("disables the trigger when isDisabled is set", () => {
    render(<ControlledSelect isDisabled />);

    expect(screen.getByRole("button", { name: /Test select/ })).toHaveProperty("disabled", true);
  });

  it("closes on Escape while open, including from the search field", () => {
    render(<ControlledSelect searchPlaceholder="Search fruits" />);

    openSelect(/Test select/);
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects the focused option on Space outside the search input", () => {
    render(<ControlledSelect />);

    openSelect(/Test select/);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: " " });

    expect(screen.getByRole("button", { name: /Alpha/ }).textContent).toContain("Alpha");
  });

  it("moves focus with the select focusNext hotkey", () => {
    render(<ControlledSelect />);

    openSelect(/Test select/);
    const listbox = screen.getByRole("listbox");

    expect(within(listbox).getByRole("option", { name: "Alpha" }).getAttribute("data-focused")).toBe("true");

    fireEvent.keyDown(listbox, { key: "j" });

    expect(within(listbox).getByRole("option", { name: "Beta" }).getAttribute("data-focused")).toBe("true");
  });
});
