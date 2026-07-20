export type TooltipArrowPlacement = "top" | "bottom" | "left" | "right";

export type TooltipSurfaceGeometry = {
  arrowCenter: number;
  height: number;
  placement: TooltipArrowPlacement;
  width: number;
};

export const TOOLTIP_ARROW_DEPTH = 7;
export const TOOLTIP_ARROW_HALF_WIDTH = 10;
const TOOLTIP_ARROW_TIP_HALF_WIDTH = 2.5;
export const TOOLTIP_BORDER_WIDTH = 2;
const TOOLTIP_RADIUS = 6;

export function getTooltipSurfacePath({ arrowCenter, height, placement, width }: TooltipSurfaceGeometry) {
  let inset = TOOLTIP_BORDER_WIDTH / 2;
  let left = inset;
  let top = inset;
  let right = Math.max(left, width - inset);
  let bottom = Math.max(top, height - inset);
  let radius = Math.min(TOOLTIP_RADIUS, (right - left) / 2, (bottom - top) / 2);
  let isVertical = placement === "top" || placement === "bottom";
  let edgeStart = isVertical ? left + radius + TOOLTIP_ARROW_HALF_WIDTH : top + radius + TOOLTIP_ARROW_HALF_WIDTH;
  let edgeEnd = isVertical ? right - radius - TOOLTIP_ARROW_HALF_WIDTH : bottom - radius - TOOLTIP_ARROW_HALF_WIDTH;
  let center = clamp(arrowCenter, edgeStart, edgeEnd);

  switch (placement) {
    case "bottom":
      return getTooltipSurfacePathWithTopArrow({ bottom, center, left, radius, right, top });
    case "left":
      return getTooltipSurfacePathWithRightArrow({ bottom, center, left, radius, right, top });
    case "right":
      return getTooltipSurfacePathWithLeftArrow({ bottom, center, left, radius, right, top });
    case "top":
      return getTooltipSurfacePathWithBottomArrow({ bottom, center, left, radius, right, top });
  }
}

type TooltipSurfacePathProps = {
  bottom: number;
  center: number;
  left: number;
  radius: number;
  right: number;
  top: number;
};

function getTooltipSurfacePathWithBottomArrow({ bottom, center, left, radius, right, top }: TooltipSurfacePathProps) {
  let arrow = getVerticalArrowPoints(center, bottom, 1);

  return [
    `M ${left + radius} ${top}`,
    `L ${right - radius} ${top}`,
    `Q ${right} ${top} ${right} ${top + radius}`,
    `L ${right} ${bottom - radius}`,
    `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `L ${arrow.end} ${bottom}`,
    `C ${arrow.endControl} ${bottom} ${arrow.tipRightControl} ${arrow.tipSide} ${arrow.tipRight} ${arrow.tipShoulder}`,
    `Q ${center} ${arrow.tip} ${arrow.tipLeft} ${arrow.tipShoulder}`,
    `C ${arrow.tipLeftControl} ${arrow.tipSide} ${arrow.startControl} ${bottom} ${arrow.start} ${bottom}`,
    `L ${left + radius} ${bottom}`,
    `Q ${left} ${bottom} ${left} ${bottom - radius}`,
    `L ${left} ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`,
    "Z",
  ].join(" ");
}

function getTooltipSurfacePathWithTopArrow({ bottom, center, left, radius, right, top }: TooltipSurfacePathProps) {
  let arrow = getVerticalArrowPoints(center, top, -1);

  return [
    `M ${left + radius} ${top}`,
    `L ${arrow.start} ${top}`,
    `C ${arrow.startControl} ${top} ${arrow.tipLeftControl} ${arrow.tipSide} ${arrow.tipLeft} ${arrow.tipShoulder}`,
    `Q ${center} ${arrow.tip} ${arrow.tipRight} ${arrow.tipShoulder}`,
    `C ${arrow.tipRightControl} ${arrow.tipSide} ${arrow.endControl} ${top} ${arrow.end} ${top}`,
    `L ${right - radius} ${top}`,
    `Q ${right} ${top} ${right} ${top + radius}`,
    `L ${right} ${bottom - radius}`,
    `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `L ${left + radius} ${bottom}`,
    `Q ${left} ${bottom} ${left} ${bottom - radius}`,
    `L ${left} ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`,
    "Z",
  ].join(" ");
}

function getTooltipSurfacePathWithRightArrow({ bottom, center, left, radius, right, top }: TooltipSurfacePathProps) {
  let arrow = getHorizontalArrowPoints(center, right, 1);

  return [
    `M ${left + radius} ${top}`,
    `L ${right - radius} ${top}`,
    `Q ${right} ${top} ${right} ${top + radius}`,
    `L ${right} ${arrow.start}`,
    `C ${right} ${arrow.startControl} ${arrow.tipSide} ${arrow.tipLeftControl} ${arrow.tipShoulder} ${arrow.tipLeft}`,
    `Q ${arrow.tip} ${center} ${arrow.tipShoulder} ${arrow.tipRight}`,
    `C ${arrow.tipSide} ${arrow.tipRightControl} ${right} ${arrow.endControl} ${right} ${arrow.end}`,
    `L ${right} ${bottom - radius}`,
    `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `L ${left + radius} ${bottom}`,
    `Q ${left} ${bottom} ${left} ${bottom - radius}`,
    `L ${left} ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`,
    "Z",
  ].join(" ");
}

function getTooltipSurfacePathWithLeftArrow({ bottom, center, left, radius, right, top }: TooltipSurfacePathProps) {
  let arrow = getHorizontalArrowPoints(center, left, -1);

  return [
    `M ${left + radius} ${top}`,
    `L ${right - radius} ${top}`,
    `Q ${right} ${top} ${right} ${top + radius}`,
    `L ${right} ${bottom - radius}`,
    `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `L ${left + radius} ${bottom}`,
    `Q ${left} ${bottom} ${left} ${bottom - radius}`,
    `L ${left} ${arrow.end}`,
    `C ${left} ${arrow.endControl} ${arrow.tipSide} ${arrow.tipRightControl} ${arrow.tipShoulder} ${arrow.tipRight}`,
    `Q ${arrow.tip} ${center} ${arrow.tipShoulder} ${arrow.tipLeft}`,
    `C ${arrow.tipSide} ${arrow.tipLeftControl} ${left} ${arrow.startControl} ${left} ${arrow.start}`,
    `L ${left} ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`,
    "Z",
  ].join(" ");
}

function getVerticalArrowPoints(center: number, edge: number, direction: 1 | -1) {
  return {
    end: center + TOOLTIP_ARROW_HALF_WIDTH,
    endControl: center + TOOLTIP_ARROW_HALF_WIDTH * 0.65,
    start: center - TOOLTIP_ARROW_HALF_WIDTH,
    startControl: center - TOOLTIP_ARROW_HALF_WIDTH * 0.65,
    tip: edge + TOOLTIP_ARROW_DEPTH * direction,
    tipLeft: center - TOOLTIP_ARROW_TIP_HALF_WIDTH,
    tipLeftControl: center - TOOLTIP_ARROW_HALF_WIDTH * 0.48,
    tipRight: center + TOOLTIP_ARROW_TIP_HALF_WIDTH,
    tipRightControl: center + TOOLTIP_ARROW_HALF_WIDTH * 0.48,
    tipShoulder: edge + TOOLTIP_ARROW_DEPTH * 0.7 * direction,
    tipSide: edge + TOOLTIP_ARROW_DEPTH * 0.36 * direction,
  };
}

function getHorizontalArrowPoints(center: number, edge: number, direction: 1 | -1) {
  return {
    end: center + TOOLTIP_ARROW_HALF_WIDTH,
    endControl: center + TOOLTIP_ARROW_HALF_WIDTH * 0.65,
    start: center - TOOLTIP_ARROW_HALF_WIDTH,
    startControl: center - TOOLTIP_ARROW_HALF_WIDTH * 0.65,
    tip: edge + TOOLTIP_ARROW_DEPTH * direction,
    tipLeft: center - TOOLTIP_ARROW_TIP_HALF_WIDTH,
    tipLeftControl: center - TOOLTIP_ARROW_HALF_WIDTH * 0.48,
    tipRight: center + TOOLTIP_ARROW_TIP_HALF_WIDTH,
    tipRightControl: center + TOOLTIP_ARROW_HALF_WIDTH * 0.48,
    tipShoulder: edge + TOOLTIP_ARROW_DEPTH * 0.7 * direction,
    tipSide: edge + TOOLTIP_ARROW_DEPTH * 0.36 * direction,
  };
}

function clamp(value: number, min: number, max: number) {
  if (min > max) return (min + max) / 2;

  return Math.min(Math.max(value, min), max);
}

export function isSameTooltipSurfaceGeometry(current: TooltipSurfaceGeometry | null, next: TooltipSurfaceGeometry) {
  return (
    current != null &&
    current.placement === next.placement &&
    Math.abs(current.arrowCenter - next.arrowCenter) < 0.1 &&
    Math.abs(current.height - next.height) < 0.1 &&
    Math.abs(current.width - next.width) < 0.1
  );
}
