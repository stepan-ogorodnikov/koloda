import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ReactNode } from "react";

export type AssistantNoProfilesProps = {
  addProfileButton: ReactNode;
};

export function AssistantNoProfiles({ addProfileButton }: AssistantNoProfilesProps) {
  const { _ } = useLingui();

  return (
    <div className="grow flex flex-col items-center justify-center gap-6 py-12">
      <p className="text-xl/6 font-bold fg-level-4 text-center">{_(msg`ai.chat.no-profiles`)}</p>
      {addProfileButton}
    </div>
  );
}
