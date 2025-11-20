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
import { demoSetupMutationOptions } from "../app/queries";

export function DemoSetup() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate } = useMutation(demoSetupMutationOptions);
  const language = useAtomValue(langAtom);
  const theme = useAtomValue(themeAtom);

  const handleClick = () => {
    mutate({ language, theme, t: _ }, {
      onSuccess: (result) => {
        if (result) {
          queryClient.resetQueries({ queryKey: ["app"] });
          navigate({ to: "/dashboard" });
        }
      },
    });
  };

  return (
    <div className="grow flex flex-col gap-4 items-center justify-center">
      <div className={overlayFrame({ class: "flex-col rounded-xl w-84" })}>
        <OverlayFrameHeader variants={{ class: "justify-center" }}>
          <OverlayFrameTitle>
            {_(msg`demo.setup.header`)}
          </OverlayFrameTitle>
        </OverlayFrameHeader>
        <OverlayFrameContent variants={{ class: "justify-center gap-4 min-h-32 text-center" }}>
          <p>{_(msg`demo.setup.storage`)}</p>
        </OverlayFrameContent>
        <OverlayFrameFooter variants={{ class: "justify-center" }}>
          <Button variants={{ style: "primary" }} onClick={handleClick}>
            {_(msg`demo.setup.submit`)}
          </Button>
        </OverlayFrameFooter>
      </div>
      <div className="flex flex-row gap-2">
        <ThemeSelect variants={{ style: "ghost" }} withChevron={false} />
        <LanguageSelect variants={{ style: "ghost" }} withChevron={false} isPersisted={false} />
      </div>
    </div>
  );
}
