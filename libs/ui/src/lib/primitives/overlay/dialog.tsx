import { useHotkeysSettings } from "@koloda/react-base";
import type { ButtonProps, TWVProps } from "@koloda/ui";
import { Button, button, matchesAnyHotkey, overlay, Popover } from "@koloda/ui";
import { X } from "lucide-react";
import { useCallback, useContext, useEffect } from "react";
import type { DialogProps, DialogTriggerProps, ModalOverlayProps, PopoverProps } from "react-aria-components";
import { Dialog as ReactAriaDialog, DialogTrigger, ModalOverlay } from "react-aria-components";
import { OverlayTriggerStateContext } from "react-aria-components";
import { tv } from "tailwind-variants";
import { Modal } from "./modal";
import { OverlayFrameContent, OverlayFrameFooter, OverlayFrameHeader, OverlayFrameTitle } from "./overlay";

export function Dialog() {
  return null;
}

type DialogRootProps = DialogTriggerProps & { dismissableWithHotkey?: boolean };

function DialogRoot({ dismissableWithHotkey, children, ...props }: DialogRootProps) {
  return (
    <DialogTrigger {...props}>
      <>
        <DialogHotkeyListener enabled={!!dismissableWithHotkey} />
        {children}
      </>
    </DialogTrigger>
  );
}

function DialogHotkeyListener({ enabled }: { enabled: boolean }) {
  const { ui } = useHotkeysSettings();
  const overlayState = useContext(OverlayTriggerStateContext);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (ui.close.length > 0 && matchesAnyHotkey(event, ui.close)) {
      event.preventDefault();
      event.stopPropagation();
      overlayState?.close();
    }
  }, [overlayState, ui]);

  useEffect(() => {
    if (!enabled || !overlayState?.isOpen || ui.close.length === 0) return;
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [enabled, onKeyDown, overlayState, ui.close.length]);

  return null;
}

type DialogOverlayProps = TWVProps<typeof overlay> & ModalOverlayProps;

function DialogOverlay({ variants, ...props }: DialogOverlayProps) {
  return <ModalOverlay className={overlay(variants)} {...props} />;
}

function DialogBody(props: DialogProps) {
  return <ReactAriaDialog className="grow min-h-0 flex flex-col focus-ring" {...props} />;
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
      <X className="size-4" />
    </Button>
  );
}

Dialog.Root = DialogRoot;
Dialog.Overlay = DialogOverlay;
Dialog.Modal = Modal;
Dialog.Popover = DialogPopover;
Dialog.Body = DialogBody;
Dialog.Close = DialogClose;
Dialog.Header = OverlayFrameHeader;
Dialog.Title = OverlayFrameTitle;
Dialog.Content = OverlayFrameContent;
Dialog.Footer = OverlayFrameFooter;

type DialogPopoverProps = PopoverProps & { dismissableWithHotkey?: boolean };

function DialogPopover({ dismissableWithHotkey = true, ...props }: DialogPopoverProps) {
  return (
    <>
      <DialogHotkeyListener enabled={dismissableWithHotkey} />
      <Popover {...props} />
    </>
  );
}
