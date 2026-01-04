import { Button, Dialog, Hotkey } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Check, X } from "lucide-react";
import { type ReactNode } from "react";

export type HotkeyRecorderPopoverProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  partialDisplay: string;
  onAccept: () => void;
  onCancel: () => void;
  isAcceptDisabled: boolean;
  children: ReactNode;
};

export function HotkeyRecorderPopover({
  isOpen,
  onOpenChange,
  partialDisplay,
  onAccept,
  onCancel,
  isAcceptDisabled,
  children,
}: HotkeyRecorderPopoverProps) {
  const { _ } = useLingui();

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={onOpenChange}>
      {children}
      <Dialog.Popover>
        <Dialog.Body>
          <div className="flex flex-row items-center gap-2 p-3 min-w-84">
            <div className="grow flex flex-row justify-center gap-1">
              {partialDisplay
                ? partialDisplay.split("+").map((key) => <Hotkey key={key} value={key} />)
                : <span className="fg-disabled animate-pulse">{_(msg`hotkey-recorder.input.placeholder`)}</span>}
            </div>
            <Button
              variants={{ size: "icon", style: "primary" }}
              aria-label={_(msg`hotkey-recorder.accept`)}
              onPress={onAccept}
              isDisabled={isAcceptDisabled}
            >
              <Check className="size-4 stroke-2" />
            </Button>
            <Button
              variants={{ size: "icon", style: "ghost" }}
              aria-label={_(msg`hotkey-recorder.cancel`)}
              onPress={onCancel}
            >
              <X className="size-4 stroke-2" />
            </Button>
          </div>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
