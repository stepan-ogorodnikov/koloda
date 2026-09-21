import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { Button, Dialog, ErrorMessage, Fade } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { AnimatePresence } from "motion/react";

type DeleteConversationConfirmContentProps = {
  onConfirm: () => void;
  isPending: boolean;
  error: unknown;
};

export function DeleteConversationConfirmContent({
  onConfirm,
  isPending,
  error,
}: DeleteConversationConfirmContentProps) {
  const { _ } = useLingui();
  const errorProps = error ? formatAppError(error, _, ERROR_MESSAGES["db.delete"]) : null;

  return (
    <>
      <Dialog.Body>
        <Dialog.Content variants={{ class: "items-center gap-4 max-w-[90vw] pt-4 pb-2" }}>
          <AnimatePresence mode="wait">
            {errorProps ? (
              <Fade key="error">
                <ErrorMessage {...errorProps} />
              </Fade>
            ) : (
              <Fade key="message">{_(msg`ai.conversation.delete.message`)}</Fade>
            )}
          </AnimatePresence>
          <div className="flex flex-row items-center gap-4">
            <Button variants={{ style: "primary" }} onPress={onConfirm} isDisabled={!!errorProps || isPending}>
              {_(msg`ai.conversation.delete.confirm`)}
            </Button>
            <Button variants={{ style: "ghost" }} slot="close" autoFocus>
              {_(msg`ai.conversation.delete.cancel`)}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Body>
    </>
  );
}
