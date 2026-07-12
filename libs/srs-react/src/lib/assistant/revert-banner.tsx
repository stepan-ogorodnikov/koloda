import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

const revertBanner = [
  "flex flex-row items-center justify-between w-full px-4 py-2",
  "rounded-t-2xl border-2 border-b-0 border-main bg-level-1",
].join(" ");

export type RevertBannerProps = {
  onRestore: () => void;
};

export function RevertBanner({ onRestore }: RevertBannerProps) {
  const { _ } = useLingui();

  return (
    <div className="self-center flex flex-col w-full max-w-3xl px-6">
      <div className={revertBanner}>
        <span className="fg-level-2">{_(msg`ai.chat.message.revert.indicator`)}</span>
        <Button variants={{ style: "ghost", size: "small", class: "fg-link hover:fg-link-hover" }} onPress={onRestore}>
          {_(msg`ai.chat.message.restore.label`)}
        </Button>
      </div>
    </div>
  );
}
