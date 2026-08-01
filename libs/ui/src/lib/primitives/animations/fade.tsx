import { motion } from "motion/react";
import type { MotionProps } from "motion/react";
import type { ComponentProps } from "react";
import { useMotionSetting } from "../../hooks/use-motion-settings";

export function Fade(props: MotionProps & ComponentProps<"div">) {
  const isMotionOn = useMotionSetting();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={isMotionOn ? { duration: 0.25 } : { duration: 0 }}
      {...props}
    />
  );
}
