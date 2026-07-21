import { describe, expect, it } from "vitest";
import {
  getTooltipSurfacePath,
  isSameTooltipSurfaceGeometry,
  TOOLTIP_ARROW_DEPTH,
  TOOLTIP_ARROW_HALF_WIDTH,
  TOOLTIP_BORDER_WIDTH,
} from "./tooltip-geometry";
import type { TooltipSurfaceGeometry } from "./tooltip-geometry";
import { getTooltipArrowPlacement } from "./tooltip-surface";

/** Mirrors private TOOLTIP_RADIUS in tooltip-geometry.ts */
const TOOLTIP_RADIUS = 6;

const baseGeometry: Omit<TooltipSurfaceGeometry, "placement"> = {
  arrowCenter: 50,
  height: 40,
  width: 120,
};

function drawableEdgeRange(width: number) {
  const inset = TOOLTIP_BORDER_WIDTH / 2;
  const left = inset;
  const right = Math.max(left, width - inset);
  const radius = Math.min(TOOLTIP_RADIUS, (right - left) / 2, (baseGeometry.height - inset * 2) / 2);
  return {
    edgeEnd: right - radius - TOOLTIP_ARROW_HALF_WIDTH,
    edgeStart: left + radius + TOOLTIP_ARROW_HALF_WIDTH,
  };
}

describe("getTooltipSurfacePath", () => {
  it("returns a closed path for each arrow placement", () => {
    for (const placement of ["top", "bottom", "left", "right"] as const) {
      const path = getTooltipSurfacePath({ ...baseGeometry, placement });

      expect(path.startsWith("M ")).toBe(true);
      expect(path.endsWith(" Z") || path.endsWith("Z")).toBe(true);
      expect(path).toContain(` ${TOOLTIP_BORDER_WIDTH / 2} `);
    }
  });

  it("clamps an out-of-range arrow center into the drawable edge", () => {
    const { edgeEnd, edgeStart } = drawableEdgeRange(baseGeometry.width);
    const bottomEdge = baseGeometry.height - TOOLTIP_BORDER_WIDTH / 2;
    const tipY = bottomEdge + TOOLTIP_ARROW_DEPTH;

    const tooFarRight = getTooltipSurfacePath({ ...baseGeometry, placement: "top", arrowCenter: 10_000 });
    const tooFarLeft = getTooltipSurfacePath({ ...baseGeometry, placement: "top", arrowCenter: -10_000 });
    const centered = getTooltipSurfacePath({ ...baseGeometry, placement: "top", arrowCenter: 60 });

    expect(tooFarRight).toEqual(getTooltipSurfacePath({ ...baseGeometry, placement: "top", arrowCenter: edgeEnd }));
    expect(tooFarLeft).toEqual(getTooltipSurfacePath({ ...baseGeometry, placement: "top", arrowCenter: edgeStart }));
    expect(tooFarRight).toContain(`Q ${edgeEnd} ${tipY}`);
    expect(tooFarLeft).toContain(`Q ${edgeStart} ${tipY}`);
    expect(centered).toContain(`Q 60 ${tipY}`);
  });
});

describe("isSameTooltipSurfaceGeometry", () => {
  it("returns false for null current geometry", () => {
    expect(isSameTooltipSurfaceGeometry(null, { ...baseGeometry, placement: "top" })).toBe(false);
  });

  it("treats near-equal geometries as the same", () => {
    const current: TooltipSurfaceGeometry = { ...baseGeometry, placement: "bottom", arrowCenter: 50 };
    const next: TooltipSurfaceGeometry = { ...baseGeometry, placement: "bottom", arrowCenter: 50.05 };

    expect(isSameTooltipSurfaceGeometry(current, next)).toBe(true);
  });

  it("detects placement or size changes", () => {
    const current: TooltipSurfaceGeometry = { ...baseGeometry, placement: "top" };

    expect(isSameTooltipSurfaceGeometry(current, { ...baseGeometry, placement: "bottom" })).toBe(false);
    expect(isSameTooltipSurfaceGeometry(current, { ...baseGeometry, placement: "top", width: 200 })).toBe(false);
  });
});

describe("getTooltipArrowPlacement", () => {
  it("falls back to top for center or null placement", () => {
    expect(getTooltipArrowPlacement(null)).toBe("top");
    expect(getTooltipArrowPlacement("center")).toBe("top");
  });

  it("passes through side placements", () => {
    expect(getTooltipArrowPlacement("bottom")).toBe("bottom");
    expect(getTooltipArrowPlacement("left")).toBe("left");
  });
});
