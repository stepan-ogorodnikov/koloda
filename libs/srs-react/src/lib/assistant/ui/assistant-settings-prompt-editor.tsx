import type { ChatPromptMode } from "@koloda/ai";
import { TextField, ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AssistantSettingsPromptEditorProps = {
  label: string;
  rows?: number;
  maxRows?: number;
  mode: ChatPromptMode;
  templateValue: string | null;
  defaultTemplate: string;
  onModeChange: (mode: ChatPromptMode) => void;
  onChange: (value: string) => void;
  isDisabled?: boolean;
};

export function AssistantSettingsPromptEditor({
  label,
  rows,
  maxRows,
  mode,
  templateValue,
  defaultTemplate,
  onModeChange,
  onChange,
  isDisabled,
}: AssistantSettingsPromptEditorProps) {
  const { _ } = useLingui();
  const isDefault = mode === "default";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center justify-between gap-2">
        <span>{label}</span>
        <ToggleGroup
          variants={{ class: "self-start" }}
          aria-label={_(msg`assistant.settings.system-prompt.mode.label`)}
          selectedKeys={[mode]}
          disallowEmptySelection
          isDisabled={isDisabled}
          onSelectionChange={([value]) => {
            const next = value?.toString();
            if (next !== "default" && next !== "custom") return;
            // WHY: first switch to Custom has no draft yet; copy the live built-in
            // prompt as a starting point. Switching to Default must not write it.
            if (next === "custom" && templateValue === null) onChange(defaultTemplate);
            onModeChange(next);
          }}
        >
          <ToggleGroup.Item id="default" isDisabled={isDisabled}>
            {_(msg`assistant.settings.system-prompt.mode.default`)}
          </ToggleGroup.Item>
          <ToggleGroup.Item id="custom" isDisabled={isDisabled}>
            {_(msg`assistant.settings.system-prompt.mode.custom`)}
          </ToggleGroup.Item>
        </ToggleGroup>
      </div>
      <TextField
        value={isDefault ? defaultTemplate : (templateValue ?? "")}
        aria-label={label}
        isReadOnly={isDefault}
        isDisabled={isDisabled}
        onChange={onChange}
      >
        <TextField.TextArea
          variants={{ style: "normal", class: "resize-none" }}
          canAutoResize
          rows={rows}
          maxRows={maxRows}
        />
      </TextField>
    </div>
  );
}
