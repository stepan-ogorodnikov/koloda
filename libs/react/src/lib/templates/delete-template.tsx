import { defaultTemplateAtom } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import { ERROR_MESSAGES, isAppError } from "@koloda/srs";
import type { Template } from "@koloda/srs";
import { DeleteDialog, Fade, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";

type DeleteTemplateProps = {
  id: Template["id"];
  isLocked: boolean;
};

export function DeleteTemplate({ id, isLocked }: DeleteTemplateProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const navigate = useNavigate({ from: "/templates/$templateId" });
  const defaultTemplate = useAtomValue(defaultTemplateAtom);
  const { deleteTemplateMutation, getTemplateDecksQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: queryKeys.templates.decks(id), ...getTemplateDecksQuery({ id: Number(id) }) });
  const { mutate, error, reset } = useMutation(deleteTemplateMutation());

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) reset();
  };

  const handleConfirm = () => {
    mutate({ id: Number(id) }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() });
        queryClient.removeQueries({ queryKey: queryKeys.templates.detail(id) });
        navigate({ to: "/templates" });
      },
    });
  };

  const isDefault = defaultTemplate === id;
  const isDisabled = !!(data?.length && data.length > 0) || isDefault || isLocked;
  const reason = isLocked
    ? msg`delete-template.cant-delete-locked`
    : (isDefault ? msg`delete-template.cant-delete-default` : msg`delete-template.cant-delete-used`);

  const message = isAppError(error) ? ERROR_MESSAGES[error.code] : msg`db.delete`;

  return (
    <DeleteDialog onOpenChange={handleOpenChange}>
      <div className="relative">
        <DeleteDialog.Trigger isDisabled={isDisabled}>
          {_(msg`delete-template.trigger`)}
        </DeleteDialog.Trigger>
        {isDisabled && (
          <Tooltip content={_(reason)} delay={0}>
            <Tooltip.HiddenTrigger />
          </Tooltip>
        )}
      </div>
      <DeleteDialog.Frame>
        <AnimatePresence>
          {error
            ? (
              <Fade>
                {typeof message === "function" ? _(message(error)) : _(message)}
              </Fade>
            )
            : (
              <Fade>
                {_(msg`delete-template.message`)}
              </Fade>
            )}
        </AnimatePresence>
        <DeleteDialog.Actions>
          <DeleteDialog.Cancel>{_(msg`delete-template.cancel`)}</DeleteDialog.Cancel>
          <DeleteDialog.Confirm onClick={handleConfirm} isDisabled={!!error}>
            {_(msg`delete-template.confirm`)}
          </DeleteDialog.Confirm>
        </DeleteDialog.Actions>
      </DeleteDialog.Frame>
    </DeleteDialog>
  );
}
