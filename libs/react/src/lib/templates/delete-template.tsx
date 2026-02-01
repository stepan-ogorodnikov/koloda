import { defaultTemplateAtom, queriesAtom, templatesQueryKeys } from "@koloda/react";
import type { Template } from "@koloda/srs";
import { DeleteDialog, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

type DeleteTemplateProps = { id: Template["id"] };

export function DeleteTemplate({ id }: DeleteTemplateProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const navigate = useNavigate({ from: "/templates/$templateId" });
  const defaultTemplate = useAtomValue(defaultTemplateAtom);
  const { deleteTemplateMutation, getTemplateDecksQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: templatesQueryKeys.decks(id), ...getTemplateDecksQuery({ id: Number(id) }) });
  const { mutate } = useMutation(deleteTemplateMutation());

  const handleConfirm = () => {
    mutate({ id: Number(id) }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: templatesQueryKeys.all() });
        queryClient.removeQueries({ queryKey: templatesQueryKeys.detail(id) });
        navigate({ to: "/templates" });
      },
    });
  };
  const isDefault = defaultTemplate === Number(id);
  const isDisabled = !!(data?.length && data.length > 0) || isDefault;
  const reason = isDefault ? msg`delete-template.cant-delete-default` : msg`delete-template.cant-delete-locked`;

  return (
    <DeleteDialog>
      <div className="relative">
        <DeleteDialog.Trigger isDisabled={isDisabled}>
          {_(msg`delete-template.trigger`)}
        </DeleteDialog.Trigger>
        {isDisabled && (
          <Tooltip content={_(reason)} delay={0} isDisabled={!isDisabled}>
            <Tooltip.HiddenTrigger />
          </Tooltip>
        )}
      </div>
      <DeleteDialog.Frame>
        {_(msg`delete-template.message`)}
        <DeleteDialog.Actions>
          <DeleteDialog.Cancel>{_(msg`delete-template.cancel`)}</DeleteDialog.Cancel>
          <DeleteDialog.Confirm onClick={handleConfirm}>{_(msg`delete-template.confirm`)}</DeleteDialog.Confirm>
        </DeleteDialog.Actions>
      </DeleteDialog.Frame>
    </DeleteDialog>
  );
}
