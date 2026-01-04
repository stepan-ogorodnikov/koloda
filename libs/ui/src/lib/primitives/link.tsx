import { Link as RouterLink } from "@tanstack/react-router";
import type { LinkComponentProps } from "@tanstack/react-router";
import { mergeProps } from "react-aria";
import { useFocusRing } from "react-aria";
import { tv } from "tailwind-variants";

export const link = tv({
  base: "fg-link hover:fg-link-hover focus-ring animate-colors",
  variants: { type: { added: "p-2 rounded-lg font-medium" } },
});

type LinkProps = LinkComponentProps;

export function Link(props: LinkProps) {
  const { focusProps, isFocusVisible } = useFocusRing();

  return (
    <RouterLink
      {...mergeProps(props, focusProps)}
      activeProps={{ "data-current": "true" }}
      data-focus-visible={isFocusVisible || undefined}
    />
  );
}
