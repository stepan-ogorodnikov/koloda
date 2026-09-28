import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function AddIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.001 5.00003V19.002" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.002 12.002L4.99998 12.002" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}
