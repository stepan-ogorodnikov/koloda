import { Button, Dialog, HotKey } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useHotkeyRecorder } from "@tanstack/react-hotkeys";
import type { Hotkey } from "@tanstack/react-hotkeys";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export type HotkeyRecorderProps = {
  onAccept: (hotkey: Hotkey | null) => void;
  children: ReactNode;
};

export function HotkeyRecorder({ onAccept, children }: HotkeyRecorderProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState<Hotkey | null>(null);
  const { startRecording, stopRecording } = useHotkeyRecorder({
    onRecord: (hotkey) => setValue(hotkey),
  });

  useEffect(() => {
    (isOpen ? startRecording : stopRecording)();
    if (!isOpen) setValue(null);
    return () => stopRecording();
  }, [isOpen, startRecording, stopRecording]);

  const handleAccept = () => {
    onAccept(value);
    setIsOpen(false);
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      {children}
      <Dialog.Popover>
        <Dialog.Body>
          <div className="flex flex-row items-center gap-2 p-3 min-w-84">
            <div className="grow flex flex-row justify-center gap-1">
              {value
                ? <HotKey value={value} />
                : <span className="fg-disabled animate-pulse">{_(msg`hotkey-recorder.input.placeholder`)}</span>}
            </div>
            <Button
              variants={{ size: "icon", style: "primary" }}
              aria-label={_(msg`hotkey-recorder.accept`)}
              onPress={handleAccept}
              isDisabled={!value}
            >
              <Check className="size-4 stroke-2" />
            </Button>
            <Button
              variants={{ size: "icon", style: "ghost" }}
              aria-label={_(msg`hotkey-recorder.cancel`)}
              onPress={() => setIsOpen(false)}
            >
              <X className="size-4 stroke-2" />
            </Button>
          </div>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
