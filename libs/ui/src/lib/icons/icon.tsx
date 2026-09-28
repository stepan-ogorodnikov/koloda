import type { ComponentType, SVGProps } from "react";

// WHY: every icon in this folder is the same 24px stroked shell plus a handful
// of shapes, so the shell lives here and each icon only supplies its shapes.
export type IconProps = SVGProps<SVGSVGElement>;

export type IconComponent = ComponentType<IconProps>;

export function Icon({ strokeWidth = 1.5, children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      {...props}
    >
      {children}
    </svg>
  );
}
