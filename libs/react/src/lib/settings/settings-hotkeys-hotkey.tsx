import { Button, HotKey, HotkeyRecorder } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { Hotkey } from "@tanstack/react-hotkeys";
import { Pencil, X } from "lucide-react";
import { useCallback } from "react";

export type SettingsHotkeysHotkeyProps = {
  value: string | null;
  onChange: (value: Hotkey | null) => void;
  hasError?: boolean;
};

export function SettingsHotkeysHotkey({ value, onChange, hasError }: SettingsHotkeysHotkeyProps) {
  const { _ } = useLingui();

  const handleDelete = useCallback(() => {
    onChange(null);
  }, [onChange]);

  return (
    <div className="flex flex-row items-center gap-1">
      <div
        className="flex flex-row items-center gap-1 rounded-md data-has-error:error-ring"
        data-has-error={hasError || undefined}
      >
        {value && <HotKey value={value} />}
      </div>
      <HotkeyRecorder onAccept={onChange}>
        <Button
          variants={{ size: "smallIcon", style: "ghost" }}
          aria-label={_(msg`hotkey-recorder.edit-button.label`)}
        >
          <Pencil className="size-4 stroke-2" />
        </Button>
      </HotkeyRecorder>
      <Button
        variants={{ size: "smallIcon", style: "ghost" }}
        aria-label={_(msg`hotkey-recorder.delete-button.label`)}
        onPress={handleDelete}
      >
        <X className="size-4 stroke-2" />
      </Button>
    </div>
  );
}
