import { parseTime } from "@internationalized/date";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeField } from "./time-field";

describe("TimeField", () => {
  it("shows an unpadded 12-hour clock with a day period", () => {
    render(
      <TimeField aria-label="Start" hourCycle={12} shouldForceLeadingZeros={false} value={parseTime("17:05")}>
        <TimeField.Input />
      </TimeField>,
    );

    expect(screen.getByRole("spinbutton", { name: /hour/i }).textContent).toBe("5");
    expect(screen.getByRole("spinbutton", { name: /day period|AM\/PM|PM/i }).textContent).toBe("PM");
  });

  it("shows a padded 24-hour clock without a day period", () => {
    render(
      <TimeField aria-label="Start" hourCycle={24} shouldForceLeadingZeros value={parseTime("05:00")}>
        <TimeField.Input />
      </TimeField>,
    );

    expect(screen.getByRole("spinbutton", { name: /hour/i }).textContent).toBe("05");
    expect(screen.queryByRole("spinbutton", { name: /day period|AM\/PM/i })).toBeNull();
  });
});
