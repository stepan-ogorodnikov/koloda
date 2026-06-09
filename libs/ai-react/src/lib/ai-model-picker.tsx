import { Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Fade, Select, Tooltip, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence, motion } from "motion/react";
import { useAIModels } from "./use-ai-models";

export type AIModelPickerProps = {
  profileId: string | null;
  value: string;
  onChange: (value: string) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
};

export function AIModelPicker({ profileId, value, onChange, triggerRef }: AIModelPickerProps) {
  const { _ } = useLingui();
  const { models, error, isLoading, refetch } = useAIModels(profileId);
  const isMotionOn = useMotionSetting();

  if (!profileId) return null;

  const cube = {
    initial: { opacity: 0, rotateX: 60, y: "-75%" },
    animate: { opacity: 1, rotateX: 0, y: 0 },
    exit: { opacity: 0, rotateX: -60, y: "75%" },
    transition: isMotionOn ? { duration: 0.25 } : { duration: 0 },
  };

  return (
    <AnimatePresence mode="wait">
      {!isLoading && !error && (
        <Fade className="min-w-0" key="ready">
          <Select
            buttonVariants={{ style: "ghost" }}
            popoverVariants={{ class: "min-w-84" }}
            listboxVariants={{ class: "h-96" }}
            aria-label={_(msg`ai.model-picker.label`)}
            placeholder={_(msg`ai.model-picker.placeholder`)}
            searchLabel={_(msg`ai.model-picker.search.label`)}
            searchPlaceholder={_(msg`ai.model-picker.search.placeholder`)}
            triggerRef={triggerRef}
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
      {(isLoading || error) && (
        <Fade
          className="flex flex-row items-center gap-2 h-10 min-w-0 -mx-2 px-2 overflow-hidden"
          key="status"
        >
          <Tooltip content={_(msg`ai.model-picker.error.retry`)}>
            <Button
              variants={{ style: "ghost", size: "smallIcon", class: "disabled:fg-level-2" }}
              aria-label={_(msg`ai.model-picker.error.retry`)}
              isDisabled={isLoading}
              onPress={() => refetch()}
            >
              <HugeiconsIcon
                className={`size-5 min-w-5 ${isLoading ? "animate-spin" : ""}`}
                strokeWidth={1.75}
                icon={Refresh04Icon}
                aria-hidden="true"
              />
            </Button>
          </Tooltip>
          <div
            className="grid perspective-near"
            style={{ transformStyle: "preserve-3d" }}
          >
            <AnimatePresence initial={false}>
              {isLoading
                ? (
                  <motion.div
                    className="[grid-area:1/1]"
                    style={{ backfaceVisibility: "hidden" }}
                    key="loading"
                    {...cube}
                  >
                    <span>{_(msg`ai.model-picker.loading.label`)}</span>
                  </motion.div>
                )
                : (
                  <motion.div
                    className="[grid-area:1/1]"
                    style={{ backfaceVisibility: "hidden" }}
                    key="error"
                    {...cube}
                  >
                    <span className="truncate fg-error">{_(msg`ai.model-picker.error.label`)}</span>
                  </motion.div>
                )}
            </AnimatePresence>
          </div>
        </Fade>
      )}
    </AnimatePresence>
  );
}
