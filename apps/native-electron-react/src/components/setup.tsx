import { Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { ColorSchemePicker, LanguagePicker } from "@koloda/settings-react";
import { langAtom, schemeAtom } from "@koloda/core-react";
import {
  Button,
  ErrorMessage,
  overlayFrame,
  OverlayFrameContent,
  OverlayFrameFooter,
  OverlayFrameHeader,
  OverlayFrameTitle,
} from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { appSetupMutationOptions } from "../app/queries";

export function Setup() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate, isPending, isError, error } = useMutation(appSetupMutationOptions);
  const language = useAtomValue(langAtom);
  const scheme = useAtomValue(schemeAtom);
  const setupError = isError && error ? formatAppError(error, _, ERROR_MESSAGES.unknown) : null;

  const handleClick = () => {
    if (isPending) return;
    mutate(
      { language, scheme, t: _ },
      {
        onSuccess: () => {
          queryClient.resetQueries({ queryKey: ["app"] });
          navigate({ to: "/dashboard" });
        },
      },
    );
  };

  return (
    <div className="grow flex flex-col gap-4 items-center justify-center">
      <div className={overlayFrame({ class: "flex-col rounded-xl w-84" })}>
        <OverlayFrameHeader variants={{ class: "justify-center" }}>
          <OverlayFrameTitle>{_(msg`app.setup.header`)}</OverlayFrameTitle>
        </OverlayFrameHeader>
        <OverlayFrameContent variants={{ class: "justify-center gap-4 min-h-32 text-center" }}>
          {setupError ? (
            <ErrorMessage message={setupError.message} details={setupError.details} />
          ) : (
            <p>{_(msg`app.setup.message`)}</p>
          )}
        </OverlayFrameContent>
        <OverlayFrameFooter variants={{ class: "justify-center" }}>
          <Button variants={{ style: "primary" }} onClick={handleClick} isDisabled={isPending}>
            {isPending && (
              <HugeiconsIcon
                className="size-5 min-w-5 animate-spin"
                strokeWidth={1.75}
                icon={Refresh04Icon}
                aria-hidden="true"
              />
            )}
            {_(msg`app.setup.submit`)}
          </Button>
        </OverlayFrameFooter>
      </div>
      <div className="flex flex-row gap-2">
        <ColorSchemePicker buttonVariants={{ style: "ghost" }} showChevron={false} isPersisted={false} />
        <LanguagePicker buttonVariants={{ style: "ghost" }} showChevron={false} isPersisted={false} />
      </div>
    </div>
  );
}
