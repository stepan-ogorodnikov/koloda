import type { RefObject } from "react";
import { useCallback, useLayoutEffect, useState } from "react";
import type { PlacementAxis } from "react-aria";
import { getTooltipSurfacePath, isSameTooltipSurfaceGeometry, TOOLTIP_BORDER_WIDTH } from "./tooltip-geometry";
import type { TooltipArrowPlacement, TooltipSurfaceGeometry } from "./tooltip-geometry";

export function getTooltipArrowPlacement(placement: PlacementAxis | null): TooltipArrowPlacement {
  return placement === "center" || placement == null ? "top" : placement;
}

type TooltipSurfaceProps = {
  arrowRef: RefObject<HTMLDivElement | null>;
  placement: TooltipArrowPlacement;
  tooltipRef: RefObject<HTMLDivElement | null>;
};

export function TooltipSurface({ arrowRef, placement, tooltipRef }: TooltipSurfaceProps) {
  let [geometry, setGeometry] = useState<TooltipSurfaceGeometry | null>(null);

  let updateGeometry = useCallback(() => {
    let tooltip = tooltipRef.current;
    let arrow = arrowRef.current;

    if (!tooltip || !arrow) return;

    let tooltipRect = tooltip.getBoundingClientRect();
    let arrowRect = arrow.getBoundingClientRect();

    let nextGeometry = {
      arrowCenter:
        placement === "top" || placement === "bottom"
          ? arrowRect.left + arrowRect.width / 2 - tooltipRect.left
          : arrowRect.top + arrowRect.height / 2 - tooltipRect.top,
      height: tooltipRect.height,
      placement,
      width: tooltipRect.width,
    };

    setGeometry((current) => (isSameTooltipSurfaceGeometry(current, nextGeometry) ? current : nextGeometry));
  }, [arrowRef, placement, tooltipRef]);

  useLayoutEffect(() => {
    updateGeometry();
  });

  useLayoutEffect(() => {
    let tooltip = tooltipRef.current;
    let arrow = arrowRef.current;

    if (!tooltip || !arrow) return;

    let resizeObserver = new ResizeObserver(updateGeometry);
    resizeObserver.observe(tooltip);
    resizeObserver.observe(arrow);

    return () => resizeObserver.disconnect();
  }, [arrowRef, tooltipRef, updateGeometry]);

  if (!geometry) return null;

  return (
    <svg
      className="absolute inset-0 -z-10 overflow-visible pointer-events-none"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      height={geometry.height}
      width={geometry.width}
      aria-hidden
    >
      <path
        d={getTooltipSurfacePath(geometry)}
        fill="var(--bg-level-1)"
        stroke="var(--border-main)"
        strokeWidth={TOOLTIP_BORDER_WIDTH}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
