import type { TWVProps } from "@koloda/ui";
import type { ComponentProps, PropsWithChildren } from "react";
import { Modal as ReactAriaModal } from "react-aria-components";
import { tv } from "tailwind-variants";
import { overlayFrame } from "./overlay";

const modal = tv({
  extend: overlayFrame,
  base: "rounded-xl",
  variants: {
    size: {
      fullscreen: "absolute inset-1 flex items-center justify-center",
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
