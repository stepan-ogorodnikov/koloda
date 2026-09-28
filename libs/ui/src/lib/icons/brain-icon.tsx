import { Icon } from "./icon";
import type { IconProps } from "./icon";

export function BrainIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 18V5m3 8a4.17 4.17 0 0 1-3-4a4.17 4.17 0 0 1-3 4m8.598-6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 18a4 4 0 0 0 2-7.464" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 18a4 4 0 0 1-2-7.464" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}
