import type { TWVProps } from "@koloda/ui";
import { Group, type GroupProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const fieldGroup = tv({
  base: "flex flex-row items-center min-w-0 rounded-lg",
  variants: {
    style: {
      input: "bg-input fg-level-1 border-input border-2 shadow-input",
      button: "bg-button-primary fg-level-1 border-button-primary border-2 shadow-button-primary",
      ghost: "",
    },
    focusable: {
      true: "focus-within:focus-ring",
    },
    size: {
      default: "h-10",
    },
  },
});

export type FieldGroupProps = GroupProps & TWVProps<typeof fieldGroup>;

export function FieldGroup({ variants, ...props }: FieldGroupProps) {
  return <Group className={fieldGroup(variants)} {...props} />;
}
