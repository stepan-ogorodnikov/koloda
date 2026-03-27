import { DragDropHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ComponentProps } from "react";

type DragHandleProps = ComponentProps<typeof Button>;

export function DragHandle(props: DragHandleProps) {
  const { _ } = useLingui();

  return (
    <Button
      variants={{
        style: "ghost",
        size: "none",
        class: "h-10 px-1 rounded-md cursor-grab drag-focus-ring",
      }}
      aria-label={_(msg`drag-handle.label`)}
      aria-roledescription={_(msg`drag-handle.description`)}
      {...props}
    >
      <HugeiconsIcon
        className="size-5 min-w-5 fg-level-3 rotate-90"
        strokeWidth={1.75}
        icon={DragDropHorizontalIcon}
        aria-hidden="true"
      />
    </Button>
  );
}
