import type { AIProfile } from "@koloda/srs";
import { AI_PROVIDER_LABELS } from "@koloda/srs";
import { Select } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAIProfiles } from "./use-ai-profiles";

export type AIProfilePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

export function AIProfilePicker({ value, onChange }: AIProfilePickerProps) {
  const { _ } = useLingui();
  const { profiles, isLoading } = useAIProfiles();

  if (isLoading) return null;

  return (
    <Select
      buttonVariants={{ style: "ghost" }}
      popoverVariants={{ class: "min-w-72" }}
      aria-label={_(msg`ai.profile-picker.label`)}
      items={profiles}
      value={value}
      onChange={(key) => key && onChange(key.toString())}
    >
      {(item: AIProfile) => {
        const title = item.title || _(msg`settings.ai.profiles.title.placeholder`);
        const provider = item.secrets ? AI_PROVIDER_LABELS[item.secrets.provider] : "";

        return (
          <Select.ListBoxItem id={item.id} textValue={`${title} ${provider}`} key={item.id}>
            <span className={item.title ? undefined : "fg-disabled"}>{title}</span>
            <span className="fg-level-3">{provider}</span>
          </Select.ListBoxItem>
        );
      }}
    </Select>
  );
}