import { useSortable } from "@dnd-kit/react/sortable";
import type { PropsWithChildren } from "react";
import { DragHandle } from "./drag-handle";

type DraggableProps = PropsWithChildren & {
  id: number | string;
  index: number;
};

export function Draggable({ id, index, children }: DraggableProps) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });

  return (
    <div
      className="flex flex-row items-center rounded-lg border-2 border-input"
      ref={ref}
    >
      <DragHandle data-is-dragging={isDragging || undefined} ref={handleRef} />
      {children}
    </div>
  );
}
