import type { ButtonProps, TWVProps } from "@koloda/ui";
import { Button, overlay, Popover } from "@koloda/ui";
import { X } from "lucide-react";
import type { DialogProps, ModalOverlayProps } from "react-aria-components";
import { Dialog as ReactAriaDialog, DialogTrigger, ModalOverlay } from "react-aria-components";
import { Modal } from "./modal";
import { OverlayFrameContent, OverlayFrameFooter, OverlayFrameHeader, OverlayFrameTitle } from "./overlay";

export function Dialog() {
  return null;
}

type DialogOverlayProps = TWVProps<typeof overlay> & ModalOverlayProps;

function DialogOverlay({ variants, ...props }: DialogOverlayProps) {
  return <ModalOverlay className={overlay(variants)} {...props} />;
}

function DialogBody(props: DialogProps) {
  return <ReactAriaDialog className="grow flex flex-col focus-ring" {...props} />;
}

function DialogClose(props: ButtonProps) {
  return (
    <Button variants={{ style: "bordered", size: "none", class: "p-1" }} {...props}>
      <X className="size-4" />
    </Button>
  );
}

Dialog.Root = DialogTrigger;
Dialog.Overlay = DialogOverlay;
Dialog.Modal = Modal;
Dialog.Popover = Popover;
Dialog.Body = DialogBody;
Dialog.Close = DialogClose;
Dialog.Header = OverlayFrameHeader;
Dialog.Title = OverlayFrameTitle;
Dialog.Content = OverlayFrameContent;
Dialog.Footer = OverlayFrameFooter;
