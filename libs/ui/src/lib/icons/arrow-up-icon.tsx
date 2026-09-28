import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5.5V19" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M18 11C18 11 13.5811 5.00001 12 5C10.4188 4.99999 6 11 6 11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}
