import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="m4.5 11.795l4.221 4.221a1.596 1.596 0 0 0 2.272 0L19.5 7.51"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}
