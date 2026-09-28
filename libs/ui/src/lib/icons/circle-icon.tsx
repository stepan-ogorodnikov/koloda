import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function CircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" strokeLinejoin="round" />
    </Icon>
  );
}
