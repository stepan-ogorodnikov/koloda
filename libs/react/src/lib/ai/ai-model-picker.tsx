import { QueryState } from "@koloda/react";
import { Select } from "@koloda/ui";
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
  const { models, ...query } = useAIModels(profileId);

  if (!profileId) return null;

  return (
    <QueryState query={query}>
      {() => (
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
          autocomplete
          virtualized
        >
          {(item) => (
            <Select.ListBoxItem id={item.id} textValue={item.name} key={item.id}>
              {item.name}
            </Select.ListBoxItem>
          )}
        </Select>
      )}
    </QueryState>
  );
}
