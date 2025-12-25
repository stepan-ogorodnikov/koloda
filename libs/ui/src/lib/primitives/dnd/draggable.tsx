import { useSortable } from "@dnd-kit/react/sortable";
import type { TWVProps } from "@koloda/ui";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";
import { DragHandle } from "./drag-handle";

const draggable = tv({
  base: "flex flex-row items-center rounded-lg border-2 border-input",
});

type DraggableProps = PropsWithChildren & TWVProps<typeof draggable> & {
  id: number | string;
  index: number;
};

export function Draggable({ variants, id, index, children }: DraggableProps) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });

  return (
    <div
      className={draggable(variants)}
      ref={ref}
    >
      <DragHandle data-is-dragging={isDragging || undefined} ref={handleRef} />
      {children}
    </div>
  );
}
