import { AiMagicIcon, Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AIProfile } from "@koloda/ai";
import { useAIProfilesModels } from "@koloda/ai-react";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Button, Checkbox, Dialog, SearchField, ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useState } from "react";
import type { AllowlistDraft } from "./ai-profile-models-allowlist";
import {
  buildSettingsModelRows,
  createAllowlistDraft,
  isSettingsModelRowSelected,
  setAllowlistMode,
  setAllowlistModelSelected,
  toWhitelistModelIdsUpdate,
} from "./ai-profile-models-allowlist";

export type SettingsAIProfileModelsProps = { profile: AIProfile };

export function SettingsAIProfileModels({ profile }: SettingsAIProfileModelsProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { updateAIProfileMutation } = useAtomValue(queriesAtom);
  const { mutate, isPending, error, reset } = useMutation(updateAIProfileMutation());
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<AllowlistDraft>(() => createAllowlistDraft(profile.whitelistModelIds));
  const provider = profile.secrets?.provider;
  const { byProfileId } = useAIProfilesModels(isOpen ? [profile.id] : []);
  const modelsState = byProfileId[profile.id];
  const isLoading = modelsState?.isLoading ?? false;
  const isError = modelsState?.isError ?? false;
  const rows = buildSettingsModelRows(modelsState?.models ?? [], draft, search);

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next);
    if (next) {
      setDraft(createAllowlistDraft(profile.whitelistModelIds));
      setSearch("");
      return;
    }
    reset();
  };

  const handleSave = () => {
    mutate(
      { id: profile.id, whitelistModelIds: toWhitelistModelIdsUpdate(draft) },
      {
        onSuccess: () => {
          setIsOpen(false);
          queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("ai") });
          queryClient.invalidateQueries({ queryKey: queryKeys.ai.profiles() });
        },
      },
    );
  };

  if (!provider) return null;

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variants={{ style: "ghost", size: "icon" }} aria-label={_(msg`settings.ai.models.trigger`)}>
        <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={AiMagicIcon} aria-hidden="true" />
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ class: "w-full max-w-2xl h-[min(40rem,100%)] overflow-hidden" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>{_(msg`settings.ai.models.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            {error && <p className="px-4 pt-2 fg-error">{error.details || error.message}</p>}
            <Dialog.Content variants={{ class: "flex flex-col gap-3 min-h-0" }}>
              <SearchField
                aria-label={_(msg`settings.ai.models.search.label`)}
                value={search}
                onChange={setSearch}
                onKeyDown={(e) => e.continuePropagation()}
              >
                <SearchField.Group>
                  <SearchField.Icon />
                  <SearchField.Input placeholder={_(msg`settings.ai.models.search.placeholder`)} />
                  <SearchField.ClearButton isHidden={!search} onClick={() => setSearch("")} />
                </SearchField.Group>
              </SearchField>
              <ToggleGroup
                variants={{ class: "self-start" }}
                aria-label={_(msg`settings.ai.models.mode.label`)}
                selectedKeys={[draft.mode]}
                disallowEmptySelection
                onSelectionChange={([value]) => {
                  const mode = value?.toString();
                  if (mode !== "all" && mode !== "selected") return;
                  setDraft((current) => setAllowlistMode(current, mode));
                }}
              >
                <ToggleGroup.Item id="all">{_(msg`settings.ai.models.mode.all`)}</ToggleGroup.Item>
                <ToggleGroup.Item id="selected">{_(msg`settings.ai.models.mode.selected`)}</ToggleGroup.Item>
              </ToggleGroup>
              <div className="flex flex-col grow min-h-0 overflow-y-auto">
                {isLoading ? (
                  <p className="grow flex items-center justify-center fg-level-3 text-center">
                    {_(msg`settings.ai.models.loading`)}
                  </p>
                ) : isError ? (
                  <div className="grow flex flex-col items-center justify-center gap-3">
                    <p className="fg-error">{_(msg`settings.ai.models.error`)}</p>
                    <Button
                      variants={{ style: "ghost" }}
                      aria-label={_(msg`settings.ai.models.retry`)}
                      onPress={() => modelsState?.refetch()}
                    >
                      <HugeiconsIcon
                        className="size-5 min-w-5"
                        strokeWidth={1.75}
                        icon={Refresh04Icon}
                        aria-hidden="true"
                      />
                      {_(msg`settings.ai.models.retry`)}
                    </Button>
                  </div>
                ) : rows.length === 0 ? (
                  <p className="grow flex items-center justify-center fg-level-3 text-center">
                    {_(msg`settings.ai.models.empty`)}
                  </p>
                ) : (
                  rows.map((row) => (
                    <Checkbox
                      isSelected={isSettingsModelRowSelected(draft, row.id)}
                      isDisabled={draft.mode === "all"}
                      onChange={(isSelected) =>
                        setDraft((current) => setAllowlistModelSelected(current, row.id, isSelected))
                      }
                      key={row.id}
                    >
                      <Checkbox.Indicator />
                      <Checkbox.Label variants={{ class: "truncate group-disabled:fg-level-2" }}>
                        {row.name}
                      </Checkbox.Label>
                    </Checkbox>
                  ))
                )}
              </div>
            </Dialog.Content>
            <Dialog.Footer>
              <div className="grow" />
              <Button variants={{ style: "primary" }} onPress={handleSave} isDisabled={isPending}>
                {_(msg`settings.ai.edit.submit`)}
              </Button>
            </Dialog.Footer>
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
