import type { PropsWithChildren, ReactNode } from "react";
import { useRef } from "react";
import {
  Slider as ReactAriaSlider,
  SliderThumb as ReactAriaSliderThumb,
  SliderTrack as ReactAriaSliderTrack,
} from "react-aria-components";
import type {
  SliderProps as ReactAriaSliderProps,
  SliderThumbProps as ReactAriaSliderThumbProps,
  SliderThumbRenderProps,
  SliderTrackProps as ReactAriaSliderTrackProps,
} from "react-aria-components";
import { formLayoutSection, Number, useMotionSetting } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import { tv } from "tailwind-variants";
import type { TooltipArrowPlacement } from "../overlay/tooltip/tooltip-geometry";
import { TooltipSurface } from "../overlay/tooltip/tooltip-surface";
import { label } from "./label";

const SLIDER_VALUE_EASING_STOPS = [
  0, 0.005, 0.019, 0.039, 0.066, 0.096, 0.129, 0.165, 0.202, 0.24, 0.278, 0.316, 0.354, 0.39, 0.426, 0.461, 0.494,
  0.526, 0.557, 0.586, 0.614, 0.64, 0.665, 0.689, 0.711, 0.731, 0.751, 0.769, 0.786, 0.802, 0.817, 0.831, 0.844, 0.856,
  0.867, 0.877, 0.887, 0.896, 0.904, 0.912, 0.919, 0.925, 0.931, 0.937, 0.942, 0.947, 0.951, 0.955, 0.959, 0.962, 0.965,
  0.968, 0.971, 0.973, 0.976, 0.978, 0.98, 0.981, 0.983, 0.984, 0.986, 0.987, 0.988, 0.989, 0.99, 0.991, 0.992, 0.992,
  0.993, 0.994, 0.994, 0.995, 0.995, 0.996, 0.996, 0.9963, 0.9967, 0.9969, 0.9972, 0.9975, 0.9977, 0.9979, 0.9981,
  0.9982, 0.9984, 0.9985, 0.9987, 0.9988, 0.9989, 1,
] as const;

const SLIDER_VALUE_TIMING: { duration: number; easing: string } = {
  duration: 900,
  easing: `linear(${SLIDER_VALUE_EASING_STOPS.join(",")})`,
};

type SliderState = SliderThumbRenderProps["state"];

export const sliderRoot = tv({
  base: "group flex flex-col gap-2",
  variants: {
    layout: {
      form: formLayoutSection(),
    },
  },
});

export type SliderProps<T extends number | number[]> = ReactAriaSliderProps<T> &
  PropsWithChildren &
  TWVProps<typeof sliderRoot>;

export function Slider<T extends number | number[]>({ variants, ...props }: SliderProps<T>) {
  return <ReactAriaSlider className={sliderRoot(variants)} {...props} />;
}

export function SliderContainer({ children }: PropsWithChildren) {
  return <div className="grow flex flex-row mx-4 pt-13.5">{children}</div>;
}

export type SliderTrackProps = ReactAriaSliderTrackProps & PropsWithChildren;

export function SliderTrack({ children, ...props }: SliderTrackProps) {
  return (
    <ReactAriaSliderTrack
      className="relative flex flex-row items-center h-1.5 w-full rounded-full bg-slider-track"
      {...props}
    >
      {children}
    </ReactAriaSliderTrack>
  );
}

const sliderThumbVisual = [
  "absolute inset-0 rounded-full bg-slider-thumb border-2 border-slider-thumb shadow-slider-thumb",
  "group-data-[dragging]:scale-110 transition-transform duration-150 ease-in-out",
].join(" ");

export type SliderThumbProps = ReactAriaSliderThumbProps;

export function SliderThumb({ index = 0, children, style, ...props }: SliderThumbProps) {
  const canAnimate = useMotionSetting();
  // Ease the thumb into place over the same duration/easing NumberFlow uses for the
  // digits, so the thumb, its value bubble, and the animated number share one motion
  // and a discrete value change lands them all on the same frame.
  const transitionValue = canAnimate
    ? `left ${SLIDER_VALUE_TIMING.duration}ms ${SLIDER_VALUE_TIMING.easing}, top ${SLIDER_VALUE_TIMING.duration}ms ${SLIDER_VALUE_TIMING.easing}`
    : "none";

  return (
    <ReactAriaSliderThumb
      className="group absolute top-1/2 left-1/2 size-4 rounded-full focus-ring"
      style={{ transition: transitionValue, ...style }}
      index={index}
      {...props}
    >
      {(renderProps: SliderThumbRenderProps) => (
        <>
          <div className={sliderThumbVisual} />
          {resolveSliderThumbChildren(children, renderProps, index)}
        </>
      )}
    </ReactAriaSliderThumb>
  );
}

function resolveSliderThumbChildren(
  children: ReactAriaSliderThumbProps["children"],
  renderProps: SliderThumbRenderProps,
  index: number,
): ReactNode {
  if (typeof children === "function") {
    return children(renderProps as SliderThumbRenderProps & { defaultChildren: ReactNode | undefined });
  }
  if (children != null) return children;
  return <SliderThumbValue state={renderProps.state} index={index} />;
}

const sliderThumbValue = [
  "isolate absolute bottom-full left-1/2 -translate-x-1/2",
  "flex flex-col mb-3 py-1 px-2 overflow-visible",
  "rounded-md bg-transparent fg-level-2 shadow-overlay-frame",
  "numbers-text pointer-events-none select-none",
].join(" ");

type SliderThumbValueProps = {
  state: SliderState;
  index: number;
};

function SliderThumbValue({ state, index }: SliderThumbValueProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const orientation = state.orientation === "vertical" ? "vertical" : "horizontal";
  const placement: TooltipArrowPlacement = orientation === "vertical" ? "right" : "top";

  return (
    <div className={sliderThumbValue} ref={tooltipRef}>
      <TooltipSurface placement={placement} arrowRef={arrowRef} tooltipRef={tooltipRef} />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 size-5 opacity-0 pointer-events-none"
        ref={arrowRef}
      />
      <Number className="numbers-text" transformTiming={SLIDER_VALUE_TIMING} value={state.getThumbValue(index)} />
    </div>
  );
}

function SliderLabel({ children }: PropsWithChildren) {
  return <span className={label({ class: "group-disabled:fg-disabled" })}>{children}</span>;
}

Slider.Container = SliderContainer;
Slider.Track = SliderTrack;
Slider.Thumb = SliderThumb;
Slider.Label = SliderLabel;
