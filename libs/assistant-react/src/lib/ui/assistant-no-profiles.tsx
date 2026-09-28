import { AddIcon, Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AssistantNoProfilesProps = {
  onAddProfile: () => void;
};

export function AssistantNoProfiles({ onAddProfile }: AssistantNoProfilesProps) {
  const { _ } = useLingui();
  const label = _(msg`ai.chat.no-profiles.add`);

  return (
    <div className="grow flex flex-col items-center justify-center gap-6 py-12">
      <p className="text-xl/6 font-bold fg-level-4 text-center">{_(msg`ai.chat.no-profiles`)}</p>
      <Button variants={{ style: "primary" }} aria-label={label} onPress={onAddProfile}>
        <AddIcon className="size-5 min-w-5" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </Button>
    </div>
  );
}
