import { motion } from "motion/react";
import type { MotionProps } from "motion/react";
import type { ComponentProps } from "react";
import { useMotionSetting } from "../../hooks/use-motion-settings";

// WHY: any onUpdate disables Motion's WAAPI path.
// Chrome promotes a compositor layer for accelerated opacity and the enter flashes.
function disableAcceleratedOpacity() {}

export function Fade({ style, onUpdate, ...props }: MotionProps & ComponentProps<"div">) {
  const isMotionOn = useMotionSetting();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={isMotionOn ? { duration: 0.25 } : { duration: 0 }}
      {...props}
      style={{ ...style, willChange: "auto" }}
      onUpdate={onUpdate ?? disableAcceleratedOpacity}
    />
  );
}
