import { useMotionSetting } from "@koloda/ui";
import NumberFlow from "@number-flow/react";
import type { NumberFlowProps } from "@number-flow/react";

export function Number({ animated, ...props }: NumberFlowProps) {
  const isMotionOn = useMotionSetting();

  return <NumberFlow animated={isMotionOn ? animated : false} {...props} />;
}
