import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12L4 12" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}
