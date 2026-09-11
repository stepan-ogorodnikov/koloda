import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMotionSetting } from "../../hooks/use-motion-settings";

const BLUR_PX = 2;
// WHY: Width spring must not start on the same frame layout commits; one paint
// with duration-0 width avoids a 0→measured spring that flashes and stutters.
const MOTION_ENABLE_DELAY_MS = 60;
const SPRING = { type: "spring", visualDuration: 0.5, bounce: 0 } as const;

const gridStyle = {
  gridTemplateAreas: '"text"',
  justifyItems: "start" as const,
};

// WHY: Blur cross-fades hit the compositor; these hints reduce subpixel shimmer
// and jagged text while filter animates — removing them looks "fine" until motion.
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
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const [isMotionReady, setIsMotionReady] = useState(false);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return undefined;
    el.textContent = value;
    const nextWidth = el.getBoundingClientRect().width;
    el.textContent = "";
    setWidth(nextWidth);
    if (nextWidth > 0 && !isLayoutReady) {
      // WHY: Defer motion tree until after measure + one frame so width is
      // non-zero before the animated grid mounts (see isMotionReady gate).
      const frame = requestAnimationFrame(() => setIsLayoutReady(true));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [value, className, isLayoutReady]);

  // WHY: Two-phase gate — layout first (static text + measure), then enable
  // width spring after MOTION_ENABLE_DELAY_MS; skipping either phase regresses jank.
  useEffect(() => {
    if (!isLayoutReady || isMotionReady) return undefined;
    const id = window.setTimeout(() => setIsMotionReady(true), MOTION_ENABLE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [isLayoutReady, isMotionReady]);

  if (!isMotionOn) {
    return (
      <span className={className} {...props}>
        {value}
      </span>
    );
  }

  // WHY: Off-screen probe — same className/fonts as visible text; in-flow measure
  // would shift layout and pollute width before the clip grid exists.
  const measure = (
    <span
      className={className}
      style={{ position: "absolute", left: "-9999px", top: 0, pointerEvents: "none", whiteSpace: "pre" }}
      aria-hidden
      ref={measureRef}
    />
  );

  if (!isLayoutReady) {
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
        transition={isMotionReady ? SPRING : { duration: 0 }}
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
