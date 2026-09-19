import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailyLimitCapField } from "./settings-learning";

describe("DailyLimitCapField", () => {
  it("writes null when Unlimited is turned on and restores the last number when turned off", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DailyLimitCapField label="Total" unlimitedLabel="Unlimited" value={8} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Unlimited" }));
    expect(onChange).toHaveBeenLastCalledWith(null);

    rerender(<DailyLimitCapField label="Total" unlimitedLabel="Unlimited" value={null} onChange={onChange} />);
    expect((screen.getByRole("textbox", { name: "Total" }) as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("switch", { name: "Unlimited" }));
    expect(onChange).toHaveBeenLastCalledWith(8);
  });
});
