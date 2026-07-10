import { Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AIModel, AIProfile } from "@koloda/ai";
import { AI_PROVIDER_LABELS } from "@koloda/ai";
import { Button, Fade, Select, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";
import type { RefObject } from "react";
import { useMemo } from "react";
import { decodeAIModelProfileKey, encodeAIModelProfileKey } from "./ai-model-profile-key";
import { useAIProfiles } from "./use-ai-profiles";
import { useAIProfilesModels } from "./use-ai-profiles-models";

export type AIModelProfileChange = {
  profileId: string;
  modelId: string;
};

export type AIModelProfilePickerProps = {
  profileId: string | null;
  modelId: string;
  onChange: (next: AIModelProfileChange) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

type ProfileSectionModel = AIModel & { key: string };

type ProfileSection = {
  id: string;
  title?: string;
  providerLabel: string;
  status: "loading" | "error" | "ready";
  models: ProfileSectionModel[];
  refetch: () => void;
};

export function AIModelProfilePicker({ profileId, modelId, onChange, triggerRef }: AIModelProfilePickerProps) {
  const { _ } = useLingui();
  const { profiles, isLoading: isProfilesLoading } = useAIProfiles();
  const profileIds = useMemo(() => profiles.map((profile) => profile.id), [profiles]);
  const { byProfileId } = useAIProfilesModels(profileIds);

  const selectedModelsState = profileId ? byProfileId[profileId] : undefined;
  const selectedIsLoading = !!profileId && (selectedModelsState?.isLoading ?? false);
  const selectedIsError = !!profileId && (selectedModelsState?.isError ?? false);

  const sections = useMemo((): ProfileSection[] => (
    profiles.map((profile: AIProfile) => {
      const state = byProfileId[profile.id];
      const providerLabel = profile.secrets ? AI_PROVIDER_LABELS[profile.secrets.provider] : "";
      const status = state?.isError ? "error" : state?.isLoading ? "loading" : "ready";
      const models = (state?.models ?? []).map((model) => ({
        ...model,
        key: encodeAIModelProfileKey(profile.id, model.id),
      }));

      return {
        id: profile.id,
        title: profile.title,
        providerLabel,
        status,
        models,
        refetch: state?.refetch ?? (() => undefined),
      };
    })
  ), [profiles, byProfileId]);

  const selectValue = profileId && modelId && !selectedIsError
    ? encodeAIModelProfileKey(profileId, modelId)
    : null;

  const placeholder = selectedIsLoading
    ? _(msg`ai.model-picker.loading.label`)
    : (selectedIsError
      ? _(msg`ai.model-picker.not-selected`)
      : _(msg`ai.model-picker.placeholder`));

  if (isProfilesLoading) return null;

  return (
    <Fade className="min-w-0">
      <Select
        buttonVariants={{ style: "ghost" }}
        popoverVariants={{ class: "min-w-84" }}
        listboxVariants={{ class: "h-96" }}
        aria-label={_(msg`ai.model-picker.label`)}
        placeholder={placeholder}
        searchLabel={_(msg`ai.model-picker.search.label`)}
        searchPlaceholder={_(msg`ai.model-picker.search.placeholder`)}
        triggerRef={triggerRef}
        items={sections}
        value={selectValue}
        onChange={(key) => {
          if (!key) return;
          const decoded = decodeAIModelProfileKey(key.toString());
          if (!decoded) return;
          onChange(decoded);
        }}
        hasAutocomplete
        isVirtualized
      >
        {(section) => (
          <Select.ListBoxSection id={section.id}>
            <Select.Header>
              <div className="flex flex-row items-center gap-2 min-w-0">
                {section.title && <span className="truncate">{section.title}</span>}
                {section.providerLabel && <span className="fg-level-3 shrink-0">{section.providerLabel}</span>}
              </div>
            </Select.Header>
            {section.status === "ready"
              ? (
                <Select.Collection items={section.models}>
                  {(item) => (
                    <Select.ListBoxItem id={item.key} textValue={item.name} key={item.key}>
                      {item.name}
                    </Select.ListBoxItem>
                  )}
                </Select.Collection>
              )
              : (
                <Select.ListBoxItem
                  id={`status-${section.id}`}
                  textValue={section.status === "loading"
                    ? _(msg`ai.model-picker.loading.label`)
                    : _(msg`ai.model-picker.error.label`)}
                  isDisabled
                >
                  <div className="flex flex-row items-center gap-2 min-w-0">
                    <Tooltip content={_(msg`ai.model-picker.error.retry`)}>
                      <Button
                        variants={{ style: "ghost", size: "smallIcon", class: "shrink-0 -my-1" }}
                        aria-label={_(msg`ai.model-picker.error.retry`)}
                        isDisabled={section.status === "loading"}
                        onPress={() => section.refetch()}
                      >
                        <HugeiconsIcon
                          className={`size-4 min-w-4 ${section.status === "loading" ? "animate-spin" : ""}`}
                          strokeWidth={1.75}
                          icon={Refresh04Icon}
                          aria-hidden="true"
                        />
                      </Button>
                    </Tooltip>
                    <div className="min-w-0">
                      <AnimatePresence mode="wait" initial={false}>
                        {section.status === "loading"
                          ? (
                            <Fade key="loading">
                              <span>{_(msg`ai.model-picker.loading.label`)}</span>
                            </Fade>
                          )
                          : (
                            <Fade key="error">
                              <span className="truncate fg-error">
                                {_(msg`ai.model-picker.error.label`)}
                              </span>
                            </Fade>
                          )}
                      </AnimatePresence>
                    </div>
                  </div>
                </Select.ListBoxItem>
              )}
          </Select.ListBoxSection>
        )}
      </Select>
    </Fade>
  );
}
