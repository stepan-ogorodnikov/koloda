import type { TWVProps } from "@koloda/ui";
import type { ComponentProps, ReactElement, ReactNode, RefObject } from "react";
import { Children, cloneElement, forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import { mergeProps, useFocusable, useFocusRing, useObjectRef } from "react-aria";
import type { Placement, PlacementAxis } from "react-aria";
import {
  OverlayArrow,
  Tooltip as ReactAriaTooltip,
  TooltipTrigger as ReactAriaTooltipTrigger,
} from "react-aria-components";
import type { TooltipProps as ReactAriaTooltipProps, TooltipTriggerComponentProps } from "react-aria-components";
import { mergeRefs } from "react-aria/mergeRefs";
import { tv } from "tailwind-variants";

function TooltipFocusable({ children }: { children: ReactElement<any> }) {
  const ref = useObjectRef<HTMLElement>(null);
  const { focusableProps } = useFocusable<HTMLElement>({} as any, ref);
  const child = Children.only(children);

  return cloneElement(child, {
    ...mergeProps(focusableProps as any, child.props as any),
    onKeyDown: (e: { continuePropagation?: () => void }) => e.continuePropagation?.(),
    onKeyUp: (e: { continuePropagation?: () => void }) => e.continuePropagation?.(),
    ref: mergeRefs((child as any).ref, ref),
  });
}

export type TooltipProps = TooltipTriggerComponentProps & { content?: ReactNode; placement?: Placement };

export function Tooltip({ children, content, delay = 0, closeDelay = 250, placement, ...props }: TooltipProps) {
  return (
    <ReactAriaTooltipTrigger delay={delay} closeDelay={closeDelay} {...props}>
      <TooltipFocusable>{children as ReactElement}</TooltipFocusable>
      <TooltipContent placement={placement}>{content}</TooltipContent>
    </ReactAriaTooltipTrigger>
  );
}

const tooltipContent = tv({
  base: [
    "relative isolate flex flex-col overflow-visible py-2 px-3 border-0",
    "rounded-md bg-transparent fg-level-2 shadow-overlay-frame",
    "placement-top:mb-[13px] placement-bottom:mt-[13px] placement-left:mr-[13px] placement-right:ml-[13px]",
    "motion:entering:animate-in motion:exiting:animate-out",
    "motion:entering:fade-in-0 motion:exiting:fade-out-0",
    "placement-bottom:slide-in-from-top-4 placement-bottom:slide-out-to-top-4",
    "placement-top:slide-in-from-bottom-4 placement-top:slide-out-to-bottom-4",
    "placement-left:slide-in-from-right-4 placement-left:slide-out-to-right-4",
    "placement-right:slide-in-from-left-4 placement-right:slide-out-to-left-4",
  ],
});

export type TooltipContentProps = ReactAriaTooltipProps & TWVProps<typeof tooltipContent>;

function TooltipContent({ children, variants, ...props }: TooltipContentProps) {
  let tooltipRef = useRef<HTMLDivElement>(null);
  let arrowRef = useRef<HTMLDivElement>(null);

  return (
    <ReactAriaTooltip className={tooltipContent(variants)} ref={tooltipRef} {...props}>
      {(renderProps) => (
        <>
          <TooltipSurface
            arrowRef={arrowRef}
            placement={getTooltipArrowPlacement(renderProps.placement)}
            tooltipRef={tooltipRef}
          />
          <OverlayArrow ref={arrowRef} className="pointer-events-none size-5 opacity-0" />
          {typeof children === "function" ? children(renderProps) : children}
        </>
      )}
    </ReactAriaTooltip>
  );
}

type TooltipArrowPlacement = Exclude<PlacementAxis, "center">;

type TooltipSurfaceGeometry = {
  arrowCenter: number;
  height: number;
  placement: TooltipArrowPlacement;
  width: number;
};

const TOOLTIP_ARROW_DEPTH = 7;
const TOOLTIP_ARROW_HALF_WIDTH = 10;
const TOOLTIP_ARROW_TIP_HALF_WIDTH = 2.5;
const TOOLTIP_BORDER_WIDTH = 2;
const TOOLTIP_RADIUS = 6;

function getTooltipArrowPlacement(placement: PlacementAxis | null): TooltipArrowPlacement {
  return placement === "center" || placement == null ? "top" : placement;
}

type TooltipSurfaceProps = {
  arrowRef: RefObject<HTMLDivElement | null>;
  placement: TooltipArrowPlacement;
  tooltipRef: RefObject<HTMLDivElement | null>;
};

function TooltipSurface({ arrowRef, placement, tooltipRef }: TooltipSurfaceProps) {
  let [geometry, setGeometry] = useState<TooltipSurfaceGeometry | null>(null);

  let updateGeometry = useCallback(() => {
    let tooltip = tooltipRef.current;
    let arrow = arrowRef.current;

    if (!tooltip || !arrow) return;

    let tooltipRect = tooltip.getBoundingClientRect();
    let arrowRect = arrow.getBoundingClientRect();

    let nextGeometry = {
      arrowCenter: placement === "top" || placement === "bottom"
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
      aria-hidden
      className="absolute inset-0 -z-10 overflow-visible pointer-events-none"
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      width={geometry.width}
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

function getTooltipSurfacePath({ arrowCenter, height, placement, width }: TooltipSurfaceGeometry) {
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

function isSameTooltipSurfaceGeometry(current: TooltipSurfaceGeometry | null, next: TooltipSurfaceGeometry) {
  return (
    current != null
    && current.placement === next.placement
    && Math.abs(current.arrowCenter - next.arrowCenter) < 0.1
    && Math.abs(current.height - next.height) < 0.1
    && Math.abs(current.width - next.width) < 0.1
  );
}

const tooltipTrigger = tv({
  base: "rounded-lg focus-ring",
  variants: {
    isHidden: { true: "absolute inset-0 bg-transparent border-transparent" },
    isDisabled: { true: "cursor-not-allowed" },
  },
});

type TooltipTriggerProps = ComponentProps<"div"> & TWVProps<typeof tooltipTrigger>;

const TooltipTrigger = forwardRef<HTMLDivElement, TooltipTriggerProps>(
  function TooltipTrigger({ variants, ...props }, ref) {
    const { focusProps, isFocusVisible } = useFocusRing();

    return (
      <div
        className={tooltipTrigger(variants)}
        ref={ref}
        role="button"
        tabIndex={0}
        data-focus-visible={isFocusVisible || undefined}
        {...mergeProps(focusProps, props)}
      />
    );
  },
);

Tooltip.Root = TooltipTrigger;
Tooltip.Content = TooltipContent;
Tooltip.Trigger = TooltipTrigger;
