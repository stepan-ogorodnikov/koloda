import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 18.502V5.00195" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M18 13.002C18 13.002 13.5811 19.0019 12 19.002C10.4188 19.002 6 13.002 6 13.002"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}
