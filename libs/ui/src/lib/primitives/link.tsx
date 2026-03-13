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

  const onKeyDown: LinkProps["onKeyDown"] = (event) => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <RouterLink
      {...mergeProps(props, focusProps, { onKeyDown })}
      activeProps={{ "data-current": "true" }}
      data-focus-visible={isFocusVisible || undefined}
    />
  );
}
