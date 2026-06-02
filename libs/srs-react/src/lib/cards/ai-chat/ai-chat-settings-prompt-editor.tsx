import { Edit03Icon, Undo02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, TextField, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";

export type AIChatSettingsPromptEditorProps = {
  label: string;
  rows?: number;
  maxRows?: number;
  templateValue: string | null;
  defaultTemplate: string;
  preview: string;
  onChange: (value: string | null) => void;
};

export function AIChatSettingsPromptEditor({
  label,
  rows,
  maxRows,
  templateValue,
  defaultTemplate,
  preview,
  onChange,
}: AIChatSettingsPromptEditorProps) {
  const { _ } = useLingui();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const isCustom = templateValue !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center justify-between">
        <span>{label}</span>
        <div className="flex flex-row items-center gap-2">
          <Tooltip
            content={mode === "edit"
              ? _(msg`ai-chat.settings.prompt.preview`)
              : _(msg`ai-chat.settings.prompt.edit`)}
          >
            <Button
              variants={{ style: "ghost", size: "icon" }}
              aria-label={mode === "edit"
                ? _(msg`ai-chat.settings.prompt.preview`)
                : _(msg`ai-chat.settings.prompt.edit`)}
              onPress={() => setMode((prev) => prev === "edit" ? "preview" : "edit")}
            >
              <HugeiconsIcon
                className="size-5 min-w-5"
                strokeWidth={1.75}
                icon={mode === "edit" ? ViewIcon : Edit03Icon}
                aria-hidden="true"
              />
            </Button>
          </Tooltip>
          <Tooltip content={_(msg`ai-chat.settings.prompt.reset`)} isDisabled={!isCustom}>
            <Button
              variants={{ style: "ghost", size: "icon" }}
              aria-label={_(msg`ai-chat.settings.prompt.reset`)}
              onPress={() => onChange(null)}
              isDisabled={!isCustom}
            >
              <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Undo02Icon} aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>
      {mode === "edit"
        ? (
          <TextField
            value={templateValue ?? defaultTemplate}
            aria-label={label}
            onChange={onChange}
          >
            <TextField.TextArea
              variants={{ style: "normal", class: "resize-none" }}
              autoResize
              rows={rows}
              maxRows={maxRows}
            />
          </TextField>
        )
        : (
          <TextField value={preview} aria-label={label}>
            <TextField.TextArea
              variants={{ style: "normal" }}
              autoResize
              rows={rows}
              maxRows={maxRows}
              readOnly
            />
          </TextField>
        )}
    </div>
  );
}
