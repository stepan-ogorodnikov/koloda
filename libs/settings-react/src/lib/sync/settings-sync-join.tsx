import type { JoinData, SpacePreview, ZodIssue } from "@koloda/app";
import { formatAppError } from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { Button, Dialog, ErrorMessage, Label, TextField, useAppForm } from "@koloda/ui";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { syncKnownIdsAtom } from "./sync-import-choice";
import { joinSchema } from "./sync-forms";
import { useFormatBytes } from "./sync-messages";

export type SettingsSyncJoinProps = { sync: SyncQueries };

export function SettingsSyncJoin({ sync }: SettingsSyncJoinProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button variants={{ style: "bordered" }}>{_(msg`settings.sync.join`)}</Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ class: "w-full max-w-96" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>{_(msg`settings.sync.join.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            <JoinFlow sync={sync} onDone={() => setIsOpen(false)} />
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}

export type JoinFlowProps = { sync: SyncQueries; onDone: () => void; onCancel?: () => void };

// INVARIANT: the preview never uses the code; only Join does, so a user who backs out can still use it elsewhere.
export function JoinFlow({ sync, onDone, onCancel }: JoinFlowProps) {
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<JoinData | null>(null);
  const [preview, setPreview] = useState<SpacePreview | null>(null);
  const setKnownIds = useSetAtom(syncKnownIdsAtom);
  const previewMutation = useMutation(sync.previewMutation());
  const joinMutation = useMutation(sync.joinMutation());

  const handlePreview = (data: JoinData) => {
    setRequest(data);
    previewMutation.mutate({ serverUrl: data.serverUrl, code: data.code }, { onSuccess: setPreview });
  };

  const handleJoin = () => {
    if (!request) return;
    joinMutation.mutate(request, {
      onSuccess: (result) => {
        // INVARIANT: a used database's status waits for Add or Replace; the page asks, with this count.
        setKnownIds(result.mode === "used" ? result.knownIds : null);
        queryClient.setQueryData(queryKeys.sync.status(), result.status);
        onDone();
      },
    });
  };

  if (preview) {
    return (
      <PreviewStep
        preview={preview}
        onBack={() => {
          setPreview(null);
          joinMutation.reset();
        }}
        onJoin={handleJoin}
        isPending={joinMutation.isPending}
        error={joinMutation.error}
      />
    );
  }

  return (
    <JoinForm
      sync={sync}
      initial={request}
      onSubmit={handlePreview}
      onCancel={onCancel}
      isPending={previewMutation.isPending}
      error={previewMutation.error}
    />
  );
}

type JoinFormProps = {
  sync: SyncQueries;
  initial: JoinData | null;
  onSubmit: (data: JoinData) => void;
  onCancel?: () => void;
  isPending: boolean;
  error: Error | null;
};

function JoinForm({ sync, initial, onSubmit, onCancel, isPending, error }: JoinFormProps) {
  const { _ } = useLingui();
  const { data: deviceName } = useQuery(sync.getDeviceNameQuery());

  const form = useAppForm({
    defaultValues: initial ?? { serverUrl: "", code: "", deviceName: deviceName ?? "" },
    validators: { onSubmit: joinSchema },
    onSubmit: ({ value }) => onSubmit(joinSchema.parse(value)),
  });

  const fields = [
    { name: "serverUrl", label: msg`settings.sync.server-url.label`, type: "url", placeholder: "https://" },
    { name: "code", label: msg`settings.sync.invite.code` },
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
        {onCancel && (
          <Button variants={{ style: "ghost" }} onPress={onCancel} isDisabled={isPending}>
            {_(msg`settings.sync.back`)}
          </Button>
        )}
        <div className="grow" />
        <Button variants={{ style: "primary" }} type="submit" isDisabled={isPending}>
          {_(msg`settings.sync.join.continue`)}
        </Button>
      </Dialog.Footer>
    </form>
  );
}

type PreviewStepProps = {
  preview: SpacePreview;
  onBack: () => void;
  onJoin: () => void;
  isPending: boolean;
  error: Error | null;
};

function PreviewStep({ preview, onBack, onJoin, isPending, error }: PreviewStepProps) {
  const { _ } = useLingui();
  const formatBytes = useFormatBytes();
  const name = preview.spaceName;
  const decks = preview.counts.decks ?? 0;
  const cards = preview.counts.cards ?? 0;
  const reviews = preview.counts.reviews ?? 0;
  const size = formatBytes(preview.bytes);

  return (
    <>
      <Dialog.Content variants={{ class: "flex flex-col gap-2" }}>
        <p className="font-semibold">{_(msg`settings.sync.join.preview.space ${name}`)}</p>
        <p>{_(msg`${plural(decks, { other: "settings.sync.join.preview.decks" })}`)}</p>
        <p>{_(msg`${plural(cards, { other: "settings.sync.join.preview.cards" })}`)}</p>
        <p>{_(msg`${plural(reviews, { other: "settings.sync.join.preview.reviews" })}`)}</p>
        <p className="fg-level-2">{_(msg`settings.sync.join.preview.size ${size}`)}</p>
        {error && <ErrorMessage {...formatAppError(error, _)} layout="inline" />}
      </Dialog.Content>
      <Dialog.Footer>
        <Button variants={{ style: "ghost" }} onPress={onBack} isDisabled={isPending}>
          {_(msg`settings.sync.back`)}
        </Button>
        <div className="grow" />
        <Button variants={{ style: "primary" }} onPress={onJoin} isDisabled={isPending}>
          {_(msg`settings.sync.join.submit`)}
        </Button>
      </Dialog.Footer>
    </>
  );
}
