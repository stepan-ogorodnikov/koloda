import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMotionSetting } from "../../hooks/use-motion-settings";

const BLUR_PX = 2;
const MOTION_ENABLE_DELAY_MS = 60;
const SPRING = { type: "spring", visualDuration: 0.5, bounce: 0 } as const;

const gridStyle = {
  gridTemplateAreas: '"text"',
  justifyItems: "start" as const,
};

const textCellStyle = {
  gridArea: "text",
  willChange: "filter",
  backfaceVisibility: "hidden" as const,
  WebkitFontSmoothing: "antialiased" as const,
};

export type TextSwapProps = Omit<ComponentProps<"span">, "children"> & { value: string };

export function TextSwap({ value, className, ...props }: TextSwapProps) {
  const isMotionOn = useMotionSetting();
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);
  const [motionReady, setMotionReady] = useState(false);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return undefined;
    el.textContent = value;
    const nextWidth = el.getBoundingClientRect().width;
    el.textContent = "";
    setWidth(nextWidth);
    if (nextWidth > 0 && !layoutReady) {
      const frame = requestAnimationFrame(() => setLayoutReady(true));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [value, className, layoutReady]);

  useEffect(() => {
    if (!layoutReady || motionReady) return undefined;
    const id = window.setTimeout(() => setMotionReady(true), MOTION_ENABLE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [layoutReady, motionReady]);

  if (!isMotionOn) {
    return (
      <span className={className} {...props}>
        {value}
      </span>
    );
  }

  const measure = (
    <span
      className={className}
      style={{ position: "absolute", left: "-9999px", top: 0, pointerEvents: "none", whiteSpace: "pre" }}
      aria-hidden
      ref={measureRef}
    />
  );

  if (!layoutReady) {
    return (
      <span className="relative inline-block align-baseline" {...props}>
        {measure}
        <span className={className}>{value}</span>
      </span>
    );
  }

  return (
    <span className="relative inline-block align-baseline" {...props}>
      {measure}
      <motion.span
        className="inline-grid align-baseline overflow-hidden"
        style={gridStyle}
        animate={{ width }}
        transition={motionReady ? SPRING : { duration: 0 }}
        initial={false}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            className={className}
            style={textCellStyle}
            initial={{ opacity: 0, filter: `blur(${BLUR_PX}px)` }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: `blur(${BLUR_PX}px)` }}
            transition={SPRING}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </span>
  );
}
