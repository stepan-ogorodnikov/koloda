import { Button } from "@koloda/ui";
import { GripVertical } from "lucide-react";
import type { ComponentProps } from "react";

type DragHandleProps = ComponentProps<typeof Button>;

export function DragHandle(props: DragHandleProps) {
  return (
    <Button
      variants={{
        style: "ghost",
        size: "none",
        class: "h-10 px-1 rounded-md cursor-grab",
      }}
      {...props}
    >
      <GripVertical className="size-5 fg-level-2" />
    </Button>
  );
}
