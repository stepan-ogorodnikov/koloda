import { Delete03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { tv } from "tailwind-variants";
import { Button, button } from "../primitives/form/button";
import type { ButtonProps } from "../primitives/form/button";
import { Dialog } from "../primitives/overlay/dialog";
import type { TWVProps } from "../types";

type DeleteDialogProps = ComponentProps<typeof Dialog.Root>;

export function DeleteDialog(props: DeleteDialogProps) {
  return <Dialog.Root {...props} />;
}

const deleteButtonTrigger = tv({
  extend: button,
  base: "disabled:cursor-not-allowed",
});

type DeleteDialogTriggerProps = PropsWithChildren & ButtonProps & TWVProps<typeof deleteButtonTrigger>;

function DeleteDialogTrigger({ children, ...props }: DeleteDialogTriggerProps) {
  return (
    <Button className={deleteButtonTrigger({ style: "primary" })} {...props}>
      <HugeiconsIcon className="size-5" strokeWidth={1.75} icon={Delete03Icon} aria-hidden="true" />
      {children}
    </Button>
  );
}

function DeleteDialogFrame({ children }: PropsWithChildren) {
  return (
    <Dialog.Overlay>
      <Dialog.Modal variants={{ class: "w-full max-w-84" }}>
        <Dialog.Body>
          <Dialog.Content variants={{ class: "flex flex-col items-center gap-6 py-6 px-8" }}>{children}</Dialog.Content>
        </Dialog.Body>
      </Dialog.Modal>
    </Dialog.Overlay>
  );
}

function DeleteDialogActions({ children }: PropsWithChildren) {
  return <div className="flex flex-row gap-2">{children}</div>;
}

function DeleteDialogConfirm(props: ButtonProps) {
  return <Button variants={{ style: "primary" }} {...props} />;
}

function DeleteDialogCancel(props: ButtonProps) {
  return <Button variants={{ style: "ghost" }} slot="close" {...props} />;
}

DeleteDialog.Trigger = DeleteDialogTrigger;
DeleteDialog.Frame = DeleteDialogFrame;
DeleteDialog.Actions = DeleteDialogActions;
DeleteDialog.Confirm = DeleteDialogConfirm;
DeleteDialog.Cancel = DeleteDialogCancel;
