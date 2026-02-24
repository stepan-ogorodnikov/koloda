import { langAtom, LanguageSelect, themeAtom, ThemeSelect } from "@koloda/react";
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
import { appSetupMutationOptions } from "../app/queries";

export function Setup() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate } = useMutation(appSetupMutationOptions);
  const language = useAtomValue(langAtom);
  const theme = useAtomValue(themeAtom);

  const handleClick = () => {
    mutate(
      { language, theme, t: _ },
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
    <div className="grow flex flex-col gap-4 items-center justify-center">
      <div className={overlayFrame({ class: "flex-col rounded-xl w-84" })}>
        <OverlayFrameHeader variants={{ class: "justify-center" }}>
          <OverlayFrameTitle>{_(msg`app.setup.header`)}</OverlayFrameTitle>
        </OverlayFrameHeader>
        <OverlayFrameContent variants={{ class: "justify-center gap-4 min-h-32 text-center" }}>
          <p>{_(msg`app.setup.message`)}</p>
        </OverlayFrameContent>
        <OverlayFrameFooter variants={{ class: "justify-center" }}>
          <Button variants={{ style: "primary" }} onClick={handleClick}>
            {_(msg`app.setup.submit`)}
          </Button>
        </OverlayFrameFooter>
      </div>
      <div className="flex flex-row gap-2">
        <ThemeSelect buttonVariants={{ style: "ghost" }} withChevron={false} isPersisted={false} />
        <LanguageSelect buttonVariants={{ style: "ghost" }} withChevron={false} isPersisted={false} />
      </div>
    </div>
  );
}
