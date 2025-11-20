import { Button, button, Dialog } from "@koloda/ui";
import type { ButtonProps, TWVProps } from "@koloda/ui";
import { Trash2 } from "lucide-react";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

export function DeleteDialog({ children }: PropsWithChildren) {
  return (
    <Dialog.Root>
      {children}
    </Dialog.Root>
  );
}

const deleteButtonTrigger = tv({
  extend: button,
  base: "disabled:cursor-not-allowed",
});

type DeleteDialogTriggerProps = PropsWithChildren & ButtonProps & TWVProps<typeof deleteButtonTrigger>;

function DeleteDialogTrigger({ children, ...props }: DeleteDialogTriggerProps) {
  return (
    <Button className={deleteButtonTrigger({ style: "primary", class: "relative" })} {...props}>
      <Trash2 className="size-4.5 stroke-1.75" />
      {children}
    </Button>
  );
}

function DeleteDialogFrame({ children }: PropsWithChildren) {
  return (
    <Dialog.Overlay>
      <Dialog.Modal variants={{ class: "w-full max-w-84" }}>
        <Dialog.Body>
          <Dialog.Content variants={{ class: "flex flex-col items-center gap-6 py-6 px-8" }}>
            {children}
          </Dialog.Content>
        </Dialog.Body>
      </Dialog.Modal>
    </Dialog.Overlay>
  );
}

function DeleteDialogActions({ children }: PropsWithChildren) {
  return <div className="flex flex-row gap-2">{children}</div>;
}

function DeleteDialogConfirm({ ...props }: ButtonProps) {
  return <Button variants={{ style: "primary" }} {...props} />;
}

function DeleteDialogCancel({ ...props }: ButtonProps) {
  return <Button variants={{ style: "ghost" }} slot="close" {...props} />;
}

DeleteDialog.Trigger = DeleteDialogTrigger;
DeleteDialog.Frame = DeleteDialogFrame;
DeleteDialog.Actions = DeleteDialogActions;
DeleteDialog.Confirm = DeleteDialogConfirm;
DeleteDialog.Cancel = DeleteDialogCancel;
