import { Edit03Icon, Undo02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Label, TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";

export type GenerateCardsSettingsPromptEditorProps = {
  label: string;
  rows: number;
  templateValue: string | null;
  defaultTemplate: string;
  preview: string;
  onChange: (value: string | null) => void;
};

export function GenerateCardsSettingsPromptEditor({
  label,
  rows,
  templateValue,
  defaultTemplate,
  preview,
  onChange,
}: GenerateCardsSettingsPromptEditorProps) {
  const { _ } = useLingui();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const isCustom = templateValue !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center justify-between">
        <Label>{label}</Label>
        <div className="flex flex-row items-center gap-2">
          <Button
            variants={{ style: "ghost", size: "icon" }}
            aria-label={mode === "edit"
              ? _(msg`generate-cards.settings.prompt.preview`)
              : _(msg`generate-cards.settings.prompt.edit`)}
            onPress={() => setMode((prev) => prev === "edit" ? "preview" : "edit")}
          >
            <HugeiconsIcon
              className="size-5 min-w-5"
              strokeWidth={1.75}
              icon={mode === "edit" ? ViewIcon : Edit03Icon}
              aria-hidden="true"
            />
          </Button>
          <Button
            variants={{ style: "ghost", size: "icon" }}
            aria-label={_(msg`generate-cards.settings.prompt.reset`)}
            onPress={() => onChange(null)}
            isDisabled={!isCustom}
          >
            <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Undo02Icon} aria-hidden="true" />
          </Button>
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
              variants={{ style: "normal" }}
              rows={rows}
            />
          </TextField>
        )
        : (
          <TextField value={preview} aria-label={label}>
            <TextField.TextArea
              variants={{ style: "normal" }}
              rows={rows}
              readOnly
            />
          </TextField>
        )}
    </div>
  );
}
