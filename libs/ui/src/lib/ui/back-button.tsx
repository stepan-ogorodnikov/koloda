import { Button } from "@koloda/ui";
import type { ButtonProps } from "@koloda/ui";
import { ChevronLeft } from "lucide-react";

export function BackButton(props: ButtonProps) {
  return (
    <Button
      variants={{ style: "ghost", size: "icon", class: "tb:hidden" }}
      {...props}
    >
      <ChevronLeft className="size-5" />
    </Button>
  );
}
