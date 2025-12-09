import type { TWVProps } from "@koloda/ui";
import { Group, type GroupProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const fieldGroup = tv({
  base: "flex flex-row",
  variants: {
    group: {
      true: "focus-within:focus-ring",
      false: "overflow-hidden bg-input fg-level-1 border-input border-2 rounded-lg shadow-input focus-ring",
    },
  },
});

type FieldGroupProps = GroupProps & TWVProps<typeof fieldGroup>;

export function FieldGroup({ variants, ...props }: FieldGroupProps) {
  return <Group className={fieldGroup(variants)} {...props} />;
}
