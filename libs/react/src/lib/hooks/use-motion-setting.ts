import { useAtomValue } from "jotai";
import { useReducedMotion } from "motion/react";
import { motionSettingAtom } from "../settings/settings";

export function useMotionSetting() {
  const isReducedOnDevice = useReducedMotion();
  const motionSetting = useAtomValue(motionSettingAtom);

  return ["on", "off"].includes(motionSetting) ? motionSetting === "on" : !isReducedOnDevice;
}
