import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { ColorSchemePicker, LanguagePicker, SyncFirstRunJoin } from "@koloda/settings-react";
import { langAtom, schemeAtom, syncQueriesAtom } from "@koloda/core-react";
import {
  Button,
  ChevronRightIcon,
  ErrorMessage,
  overlayFrame,
  OverlayFrameContent,
  OverlayFrameHeader,
  OverlayFrameTitle,
  RefreshIcon,
} from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useCallback, useId, useState } from "react";
import { appSetupMutationOptions } from "../app/queries";

export function Setup() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate, isPending, isError, error } = useMutation(appSetupMutationOptions);
  const language = useAtomValue(langAtom);
  const scheme = useAtomValue(schemeAtom);
  const sync = useAtomValue(syncQueriesAtom);
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const setupError = isError && error ? formatAppError(error, _, ERROR_MESSAGES.unknown) : null;

  const openApp = useCallback(() => {
    queryClient.resetQueries({ queryKey: ["app"] });
    navigate({ to: "/dashboard" });
  }, [queryClient, navigate]);

  const handleClick = () => {
    if (isPending) return;
    mutate({ language, scheme, t: _ }, { onSuccess: openApp });
  };

  return (
    <div className="grow flex flex-col gap-4 items-center justify-center">
      <div className={overlayFrame({ class: "flex-col rounded-xl w-96" })}>
        <OverlayFrameHeader variants={{ class: "" }}>
          <OverlayFrameTitle>{isJoining ? _(msg`app.setup.join`) : _(msg`app.setup.header`)}</OverlayFrameTitle>
        </OverlayFrameHeader>
        {isJoining && sync ? (
          <SyncFirstRunJoin
            sync={sync}
            onJoined={() => setHasJoined(true)}
            onReady={openApp}
            onCancel={() => setIsJoining(false)}
          />
        ) : (
          <div className="flex flex-col">
            {setupError && (
              <OverlayFrameContent>
                <ErrorMessage message={setupError.message} details={setupError.details} />
              </OverlayFrameContent>
            )}
            <SetupOption
              title={_(msg`app.setup.submit`)}
              description={_(msg`app.setup.fresh-message`)}
              onPress={handleClick}
              isPending={isPending}
            />
            {sync && (
              <SetupOption
                title={_(msg`app.setup.join`)}
                description={_(msg`app.setup.join-message`)}
                onPress={() => setIsJoining(true)}
                isDisabled={isPending}
              />
            )}
          </div>
        )}
      </div>
      {/* WHY: the join seeds the interface settings from these once; after it, a change here would not be kept. */}
      {!hasJoined && (
        <div className="flex flex-row gap-2">
          <ColorSchemePicker buttonVariants={{ style: "ghost" }} showChevron={false} />
          <LanguagePicker buttonVariants={{ style: "ghost" }} showChevron={false} isPersisted={false} />
        </div>
      )}
    </div>
  );
}

// WHY: the row runs edge to edge inside a frame that clips overflow, so the focus ring is drawn inside it.
const setupOption = [
  "group w-full justify-between gap-4 px-4 py-3 rounded-none text-left whitespace-normal",
  "not-first:border-t-2 border-main -outline-offset-4",
].join(" ");

export type SetupOptionProps = {
  title: string;
  description: string;
  onPress: () => void;
  isDisabled?: boolean;
  isPending?: boolean;
};

function SetupOption({ title, description, onPress, isDisabled, isPending }: SetupOptionProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Button
      variants={{ style: "ghost", size: "none", class: setupOption }}
      onPress={onPress}
      isDisabled={isDisabled}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <span className="flex flex-col gap-1">
        <span id={titleId} className="fg-level-1 group-disabled:fg-disabled">
          {title}
        </span>
        <span id={descriptionId} className="font-normal fg-level-3 group-disabled:fg-disabled">
          {description}
        </span>
      </span>
      {isPending ? (
        <RefreshIcon className="size-5 min-w-5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <ChevronRightIcon className="size-5 min-w-5" strokeWidth={2} aria-hidden="true" />
      )}
    </Button>
  );
}
