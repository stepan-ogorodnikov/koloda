import { Button } from "@koloda/ui";
import type { ButtonProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { ChevronLeft } from "lucide-react";

export function BackButton(props: ButtonProps) {
  const { _ } = useLingui();

  return (
    <Button
      variants={{ style: "ghost", size: "icon", class: "tb:hidden" }}
      aria-label={_(msg`back-button.label`)}
      {...props}
    >
      <ChevronLeft className="size-5" />
    </Button>
  );
}
