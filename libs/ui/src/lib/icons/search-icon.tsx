import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 17L21 21" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}
