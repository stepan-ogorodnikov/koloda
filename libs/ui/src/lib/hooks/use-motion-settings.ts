import { useAtomValue } from "jotai";
import { atom } from "jotai";
import { useReducedMotion } from "motion/react";

export const motionSettingAtom = atom("");

export function useMotionSetting() {
  const isReducedOnDevice = useReducedMotion();
  const motionSetting = useAtomValue(motionSettingAtom);

  return ["on", "off"].includes(motionSetting) ? motionSetting === "on" : !isReducedOnDevice;
}
