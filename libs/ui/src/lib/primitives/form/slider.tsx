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
  SliderTrackRenderProps,
} from "react-aria-components";
import { formLayoutSection, type TWVProps } from "@koloda/ui";
import { tv } from "tailwind-variants";
import type { TooltipArrowPlacement } from "../overlay/tooltip/tooltip-geometry";
import { TooltipSurface } from "../overlay/tooltip/tooltip-surface";
import { label } from "./label";

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
      {({ state }: SliderTrackRenderProps) => {
        const thumbPercent = state.getThumbPercent(0);
        const span = `${thumbPercent * 100}%`;
        const fillStyle =
          state.orientation === "vertical"
            ? { bottom: "0", height: span }
            : { left: "0", width: span };

        return (
          <>
            <div className="absolute inset-y-0 rounded-full bg-slider-track-fill" style={fillStyle} />
            {children}
          </>
        );
      }}
    </ReactAriaSliderTrack>
  );
}

const sliderThumbVisual = [
  "absolute inset-0 rounded-full bg-slider-thumb border-2 border-slider-thumb shadow-slider-thumb",
  "group-data-[dragging]:scale-110 transition-transform duration-150 ease-in-out",
].join(" ");

export type SliderThumbProps = ReactAriaSliderThumbProps;

export function SliderThumb({ index = 0, children, ...props }: SliderThumbProps) {
  return (
    <ReactAriaSliderThumb
      className="group absolute top-1/2 left-1/2 size-4 rounded-full focus-ring"
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
      <span>{state.getThumbValueLabel(index)}</span>
    </div>
  );
}

const sliderLabel = "group-disabled:fg-disabled";

function SliderLabel({ children }: PropsWithChildren) {
  return <span className={[label(), sliderLabel].join(" ")}>{children}</span>;
}

Slider.Container = SliderContainer;
Slider.Track = SliderTrack;
Slider.Thumb = SliderThumb;
Slider.Label = SliderLabel;
