import { Fade } from "@koloda/ui";
import { AnimatePresence } from "motion/react";

export type AIChatErrorProps = { error?: string | null };

export function AIChatError({ error }: AIChatErrorProps) {
  return (
    <AnimatePresence>
      {error && (
        <Fade className="self-center w-full max-w-3xl mb-2 px-4 py-2 rounded-xl border-2 border-main bg-level-1">
          <em className="fg-error not-italic">
            {error}
          </em>
        </Fade>
      )}
    </AnimatePresence>
  );
}
