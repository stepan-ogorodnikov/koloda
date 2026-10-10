import type { ZodIssue } from "@koloda/app";
import { formatAppError } from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { Button, Dialog, ErrorMessage, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createSpaceSchema } from "./sync-forms";

export type SettingsSyncCreateSpaceProps = { sync: SyncQueries };

export function SettingsSyncCreateSpace({ sync }: SettingsSyncCreateSpaceProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button variants={{ style: "primary" }}>{_(msg`settings.sync.create`)}</Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ class: "w-full max-w-96" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>{_(msg`settings.sync.create.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            <CreateSpaceForm sync={sync} onCreated={() => setIsOpen(false)} />
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}

type CreateSpaceFormProps = { sync: SyncQueries; onCreated: () => void };

function CreateSpaceForm({ sync, onCreated }: CreateSpaceFormProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { data: deviceName } = useQuery(sync.getDeviceNameQuery());
  const { mutate, isPending, error } = useMutation(sync.createSpaceMutation());

  const form = useAppForm({
    defaultValues: { serverUrl: "", setupToken: "", spaceName: "", deviceName: deviceName ?? "" },
    validators: { onSubmit: createSpaceSchema },
    onSubmit: ({ value }) => {
      const data = createSpaceSchema.parse(value);
      mutate(data, {
        onSuccess: (status) => {
          queryClient.setQueryData(queryKeys.sync.status(), status);
          onCreated();
        },
      });
    },
  });

  const fields = [
    { name: "serverUrl", label: msg`settings.sync.server-url.label`, type: "url", placeholder: "https://" },
    { name: "setupToken", label: msg`settings.sync.setup-token.label`, type: "password" },
    { name: "spaceName", label: msg`settings.sync.space-name.label` },
    { name: "deviceName", label: msg`settings.sync.device-name.label` },
  ] as const;

  return (
    <form
      // WHY: Native constraint validation runs before our submit handler and blocks TanStack Form onSubmit validators.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <Dialog.Content variants={{ class: "flex flex-col gap-4" }}>
        {fields.map((field) => (
          <form.Field key={field.name} name={field.name}>
            {(api) => (
              <TextField
                type={"type" in field ? field.type : undefined}
                value={api.state.value}
                onBlur={api.handleBlur}
                onChange={api.handleChange}
                isRequired
              >
                <Label>{_(field.label)}</Label>
                <TextField.Input placeholder={"placeholder" in field ? field.placeholder : undefined} />
                {!api.state.meta.isValid && <TextField.Errors errors={api.state.meta.errors as ZodIssue[]} />}
              </TextField>
            )}
          </form.Field>
        ))}
        {error && <ErrorMessage {...formatAppError(error, _)} layout="inline" />}
      </Dialog.Content>
      <Dialog.Footer>
        <div className="grow" />
        <Button variants={{ style: "primary" }} type="submit" isDisabled={isPending}>
          {_(msg`settings.sync.create.submit`)}
        </Button>
      </Dialog.Footer>
    </form>
  );
}
