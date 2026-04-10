import { BadgeAlertIcon, Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Fade, Select } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";
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

  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <Fade
          className="flex flex-row items-center h-10 min-w-0 px-2 animate-shimmer-text--fg-level-4/fg-level-1"
          key="loading"
        >
          <span>{_(msg`ai.model-picker.loading.label`)}</span>
        </Fade>
      )}
      {!isLoading && error && (
        <Fade className="flex h-10 min-w-0 flex-row items-center gap-2" key="error">
          <div className="flex min-w-0 flex-row items-center gap-1 fg-error">
            <HugeiconsIcon
              className="size-5 min-w-5 fg-error"
              strokeWidth={1.75}
              icon={BadgeAlertIcon}
              aria-hidden="true"
            />
            <span className="truncate fg-error">{_(msg`ai.model-picker.error.label`)}</span>
          </div>
          <Button
            variants={{ style: "ghost", size: "icon", class: "fg-level-2" }}
            aria-label={_(msg`ai.model-picker.error.retry`)}
            onPress={() => refetch()}
          >
            <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Refresh04Icon} aria-hidden="true" />
          </Button>
        </Fade>
      )}
      {!isLoading && !error && (
        <Fade className="min-w-0" key="ready">
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
        </Fade>
      )}
    </AnimatePresence>
  );
}
