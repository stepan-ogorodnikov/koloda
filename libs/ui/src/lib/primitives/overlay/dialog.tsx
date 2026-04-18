import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAppHotkey, useHotkeysSettings } from "@koloda/react-base";
import type { ButtonProps, TWVProps } from "@koloda/ui";
import { Button, button, dispatchKey, overlay, Popover } from "@koloda/ui";
import type { HotkeyOptions } from "@tanstack/react-hotkeys";
import type { ComponentProps } from "react";
import { useRef } from "react";
import type { DialogProps, ModalOverlayProps } from "react-aria-components";
import { Dialog as ReactAriaDialog, DialogTrigger, ModalOverlay } from "react-aria-components";
import { tv } from "tailwind-variants";
import { Modal } from "./modal";
import { OverlayFrameContent, OverlayFrameFooter, OverlayFrameHeader, OverlayFrameTitle } from "./overlay";

const options: HotkeyOptions = { ignoreInputs: false, conflictBehavior: "allow" };

export function Dialog() {
  return null;
}

type DialogOverlayProps = TWVProps<typeof overlay> & ModalOverlayProps;

function DialogOverlay({ variants, ...props }: DialogOverlayProps) {
  return <ModalOverlay className={overlay(variants)} {...props} />;
}

function DialogBody(props: DialogProps) {
  return <ReactAriaDialog className="grow min-h-0 flex flex-col focus-ring" {...props} />;
}

type DialogPopoverProps = ComponentProps<typeof Popover>;

function DialogPopover(props: DialogPopoverProps) {
  const { ui } = useHotkeysSettings();
  const ref = useRef(null);
  useAppHotkey(ui.close, () => dispatchKey(ref, "Escape"), "", options);

  return <Popover ref={ref} {...props} />;
}

type DialogModalProps = ComponentProps<typeof Modal>;

function DialogModal(props: DialogModalProps) {
  const { ui } = useHotkeysSettings();
  const ref = useRef(null);
  useAppHotkey(ui.close, () => dispatchKey(ref, "Escape"), "", options);

  return <Modal ref={ref} {...props} />;
}

export const dialogClose = tv({
  extend: button,
  base: "z-10 size-8",
  defaultVariants: {
    style: "bordered",
    size: "none",
  },
});

type DialogCloseProps = TWVProps<typeof dialogClose> & ButtonProps;

function DialogClose({ variants, ...props }: DialogCloseProps) {
  return (
    <Button className={dialogClose(variants)} {...props}>
      <HugeiconsIcon className="size-4 min-w-4" strokeWidth={1.75} icon={Cancel01Icon} aria-hidden="true" />
    </Button>
  );
}

Dialog.Root = DialogTrigger;
Dialog.Overlay = DialogOverlay;
Dialog.Modal = DialogModal;
Dialog.Popover = DialogPopover;
Dialog.Body = DialogBody;
Dialog.Close = DialogClose;
Dialog.Header = OverlayFrameHeader;
Dialog.Title = OverlayFrameTitle;
Dialog.Content = OverlayFrameContent;
Dialog.Footer = OverlayFrameFooter;
