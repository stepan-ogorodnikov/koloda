import { Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, TextField, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AssistantSettingsPromptEditorProps = {
  label: string;
  rows?: number;
  maxRows?: number;
  templateValue: string | null;
  defaultTemplate: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
};

export function AssistantSettingsPromptEditor({
  label,
  rows,
  maxRows,
  templateValue,
  defaultTemplate,
  onChange,
  isDisabled,
}: AssistantSettingsPromptEditorProps) {
  const { _ } = useLingui();
  const isCustom = templateValue !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center justify-between">
        <span>{label}</span>
        <Tooltip content={_(msg`assistant.settings.prompt.reset`)} isDisabled={!isCustom || isDisabled}>
          <Button
            variants={{ style: "ghost", size: "icon" }}
            aria-label={_(msg`assistant.settings.prompt.reset`)}
            onPress={() => onChange(defaultTemplate)}
            isDisabled={!isCustom}
          >
            <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Undo02Icon} aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
      <TextField value={templateValue ?? defaultTemplate} aria-label={label} onChange={onChange}>
        <TextField.TextArea
          variants={{ style: "normal", class: "resize-none" }}
          autoResize
          rows={rows}
          maxRows={maxRows}
        />
      </TextField>
    </div>
  );
}
