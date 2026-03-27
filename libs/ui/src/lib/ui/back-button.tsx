import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import type { ButtonProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export function BackButton(props: ButtonProps) {
  const { _ } = useLingui();

  return (
    <Button
      variants={{ style: "ghost", size: "icon", class: "tb:hidden" }}
      aria-label={_(msg`back-button.label`)}
      {...props}
    >
      <HugeiconsIcon className="size-5 min-w-5" strokeWidth={2} icon={ArrowLeft01Icon} aria-hidden="true" />
    </Button>
  );
}
