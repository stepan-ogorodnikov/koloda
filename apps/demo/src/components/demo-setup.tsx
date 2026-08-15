import { BadgeAlertIcon, Refresh04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ColorSchemePicker, LanguagePicker } from "@koloda/app-react";
import { langAtom, schemeAtom } from "@koloda/core-react";
import {
  Button,
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
import { getDemoBrowserSupport } from "../app/browser-support";
import { demoSetupMutationOptions } from "../app/queries";

export function DemoSetup() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate, isPending } = useMutation(demoSetupMutationOptions);
  const language = useAtomValue(langAtom);
  const scheme = useAtomValue(schemeAtom);
  const support = getDemoBrowserSupport();
  const canSubmit = support.canRun && !isPending;

  const handleClick = () => {
    if (!canSubmit) return;
    mutate(
      { language, scheme },
      {
        onSuccess: (result) => {
          if (result) {
            queryClient.resetQueries({ queryKey: ["app"] });
            navigate({ to: "/dashboard" });
          }
        },
      },
    );
  };

  return (
    <div className="grow flex flex-col gap-4 items-center justify-center px-4">
      <div className={overlayFrame({ class: "flex-col rounded-xl w-full max-w-md" })}>
        <OverlayFrameHeader variants={{ class: "justify-center" }}>
          <OverlayFrameTitle>{_(msg`demo.setup.header`)}</OverlayFrameTitle>
        </OverlayFrameHeader>
        <OverlayFrameContent variants={{ class: "justify-center gap-3 py-8 text-center text-balance" }}>
          {isPending ? (
            <p className="animate-shimmer-text--fg-level-4/fg-level-1">{_(msg`demo.setup.loading`)}</p>
          ) : (
            <>
              <p>{_(msg`demo.setup.storage`)}</p>
              {!support.isChromiumBased && support.canRun && (
                <p className="fg-level-3">
                  <SetupAlertIcon />
                  {_(msg`demo.setup.browser`)}
                </p>
              )}
              {!support.canRun && (
                <p className="fg-error">
                  <SetupAlertIcon />
                  {_(msg`demo.setup.unsupported`)}
                </p>
              )}
            </>
          )}
        </OverlayFrameContent>
        <OverlayFrameFooter variants={{ class: "justify-center" }}>
          <Button variants={{ style: "primary" }} onClick={handleClick} isDisabled={!canSubmit}>
            {isPending && (
              <HugeiconsIcon
                className="size-5 min-w-5 animate-spin"
                strokeWidth={1.75}
                icon={Refresh04Icon}
                aria-hidden="true"
              />
            )}
            {_(msg`demo.setup.submit`)}
          </Button>
        </OverlayFrameFooter>
      </div>
      <div className="flex flex-row gap-2">
        <ColorSchemePicker
          buttonVariants={{ style: "ghost" }}
          withChevron={false}
          isPersisted={false}
          isDisabled={isPending}
        />
        <LanguagePicker
          buttonVariants={{ style: "ghost" }}
          withChevron={false}
          isPersisted={false}
          isDisabled={isPending}
        />
      </div>
    </div>
  );
}

function SetupAlertIcon() {
  return (
    <span className="relative inline-block h-lh w-5 mr-1.5 align-bottom">
      <HugeiconsIcon
        className="absolute top-1/2 left-0 size-5 -translate-y-1/2 pointer-events-none"
        strokeWidth={1.75}
        icon={BadgeAlertIcon}
        aria-hidden="true"
      />
    </span>
  );
}
