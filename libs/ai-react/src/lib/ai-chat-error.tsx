import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";

const aiChatError = [
  "self-center flex flex-row items-center gap-2",
  "w-full max-w-3xl mb-2 px-4 py-2 rounded-xl border-2 border-main bg-level-1",
].join(" ");

export type AIChatErrorProps = { error?: string | null };

export function AIChatError({ error }: AIChatErrorProps) {
  const { _ } = useLingui();
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    setIsHidden(false);
  }, [error]);

  return (
    <AnimatePresence>
      {error && !isHidden && (
        <Fade className={aiChatError}>
          <em className="grow min-w-0 fg-error not-italic break-all">
            {error}
          </em>
          <Button
            variants={{ style: "ghost", size: "none", class: "self-start size-8 min-w-8 -mr-2" }}
            aria-label={_(msg`ai.chat.error.close`)}
            onPress={() => setIsHidden(true)}
          >
            <HugeiconsIcon
              className="size-4 min-w-4"
              strokeWidth={1.75}
              icon={Cancel01Icon}
              aria-hidden="true"
            />
          </Button>
        </Fade>
      )}
    </AnimatePresence>
  );
}
