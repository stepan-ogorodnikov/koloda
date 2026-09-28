import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function ArrowLeftDoubleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M11.5 18C11.5 18 5.50001 13.5811 5.5 12C5.49999 10.4188 11.5 6 11.5 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 18C18.5 18 12.5 13.5811 12.5 12C12.5 10.4188 18.5 6 18.5 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}
