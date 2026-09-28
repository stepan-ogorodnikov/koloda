import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6L6.00081 17.9992M17.9992 18L6 6.00085" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}
