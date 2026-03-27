import { BadgeAlertIcon, Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Select } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAIModels } from "./use-ai-models";

export type AIModelPickerProps = {
  profileId: string | null;
  value: string;
  onChange: (value: string) => void;
};

export function AIModelPicker({ profileId, value, onChange }: AIModelPickerProps) {
  const { _ } = useLingui();
  const { models, error, isLoading, refetch } = useAIModels(profileId);

  if (!profileId) return null;
  if (isLoading) return null;

  if (error) {
    return (
      <div className="flex flex-row items-center gap-2 min-w-0 h-10">
        <div className="flex flex-row items-center gap-1 fg-error">
          <HugeiconsIcon
            className="size-5 min-w-5 fg-error"
            strokeWidth={1.75}
            icon={BadgeAlertIcon}
            aria-hidden="true"
          />
          <span className="fg-error">{_(msg`ai.model-picker.error.label`)}</span>
        </div>
        <Button
          variants={{ style: "ghost", size: "icon", class: "fg-level-2" }}
          aria-label={_(msg`ai.model-picker.error.retry`)}
          onPress={() => refetch()}
        >
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Refresh04Icon} aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      buttonVariants={{ style: "ghost" }}
      popoverVariants={{ class: "min-w-84" }}
      aria-label={_(msg`ai.model-picker.label`)}
      placeholder={_(msg`ai.model-picker.placeholder`)}
      searchLabel={_(msg`ai.model-picker.search.label`)}
      searchPlaceholder={_(msg`ai.model-picker.search.placeholder`)}
      items={models}
      value={value}
      onChange={(key) => key && onChange(key.toString())}
      hasAutocomplete
      isVirtualized
    >
      {(item) => (
        <Select.ListBoxItem id={item.id} textValue={item.name} key={item.id}>
          {item.name}
        </Select.ListBoxItem>
      )}
    </Select>
  );
}
