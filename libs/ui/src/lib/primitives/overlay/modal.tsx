import type { TWVProps } from "@koloda/ui";
import type { ComponentProps, PropsWithChildren } from "react";
import { Modal as ReactAriaModal } from "react-aria-components";
import { tv } from "tailwind-variants";
import { overlayFrame } from "./overlay";

const modal = tv({
  extend: overlayFrame,
  base: [
    "rounded-xl",
    "motion:entering:animate-in motion:exiting:animate-out",
    "motion:entering:fade-in-0 motion:exiting:fade-out-0",
    "zoom-in-90 zoom-out-90",
  ],
  variants: {
    size: {
      large: [
        "max-tb:w-full tb:min-w-144",
        "max-tb:h-full min-h-[min(36rem,100%)] max-h-screen",
        "overflow-hidden",
      ],
      main: [
        "w-full max-w-main h-full max-h-screen overflow-hidden",
      ],
    },
  },
});

type ModalProps =
  & ComponentProps<typeof ReactAriaModal>
  & TWVProps<typeof modal>
  & PropsWithChildren;

export function Modal({ variants, children, ...props }: ModalProps) {
  return (
    <ReactAriaModal className={modal(variants)} {...props}>
      {children}
    </ReactAriaModal>
  );
}
