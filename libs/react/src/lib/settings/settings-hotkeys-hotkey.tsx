import { Cancel01Icon, Edit03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, HotKey, HotkeyRecorder } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { Hotkey } from "@tanstack/react-hotkeys";
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
          variants={{ size: "icon", style: "ghost" }}
          aria-label={_(msg`hotkey-recorder.edit-button.label`)}
        >
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Edit03Icon} aria-hidden="true" />
        </Button>
      </HotkeyRecorder>
      <Button
        variants={{ size: "icon", style: "ghost" }}
        aria-label={_(msg`hotkey-recorder.delete-button.label`)}
        onPress={handleDelete}
      >
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={Cancel01Icon} aria-hidden="true" />
      </Button>
    </div>
  );
}
