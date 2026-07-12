import { Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";

export type AIChatMissingSecretsProps = {
  show: boolean;
  missingLabels: string[];
};

export function AIChatMissingSecrets({ show, missingLabels }: AIChatMissingSecretsProps) {
  const { _ } = useLingui();

  return (
    <AnimatePresence>
      {show && (
        <Fade className="self-center w-full max-w-3xl mb-2 px-4 py-2 rounded-xl border-2 border-main bg-level-1 flex flex-col gap-1">
          <em className="fg-error not-italic">
            {_(msg`ai.chat.profile-data-missing`)}: {missingLabels.join(", ")}
          </em>
          <span className="fg-level-2 text-sm/6">{_(msg`ai.chat.profile-data-missing.hint`)}</span>
        </Fade>
      )}
    </AnimatePresence>
  );
}
