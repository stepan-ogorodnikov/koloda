import { createLink } from "@tanstack/react-router";
import { forwardRef } from "react";
import type { ComponentProps } from "react";
import { Link as ReactAriaLink } from "react-aria-components";
import type { LinkProps as ReactAriaLinkProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const link = tv({ base: "fg-link animate-colors", variants: { type: { added: "p-2 rounded-lg font-medium" } } });

export const Link = createLink(
  forwardRef<HTMLAnchorElement, ReactAriaLinkProps>((props, ref) => (
    <ReactAriaLink
      {...props}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
        props.onKeyDown?.(e);
      }}
    />
  )),
);

export type LinkProps = ComponentProps<typeof Link>;
