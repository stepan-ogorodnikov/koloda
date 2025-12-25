import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
import { DragDropProvider, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { Button, Checkbox, Dialog, Draggable } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { Column } from "@tanstack/react-table";
import { Columns3Cog } from "lucide-react";
import { useState } from "react";

type CardsTableColumnsVisibilityProps<TData> = {
  columns: Column<TData>[];
  onColumnVisibilityChange: (columnId: string, isVisible: boolean) => void;
  onColumnOrderChange?: (newOrder: string[]) => void;
};

export function CardsTableColumnsVisibility<TData>({
  columns,
  onColumnVisibilityChange,
  onColumnOrderChange,
}: CardsTableColumnsVisibilityProps<TData>) {
  const { _ } = useLingui();
  const [items, setItems] = useState<string[]>(columns.map(({ id }) => id));

  if (columns.length !== items.length || columns.some((col) => !items.includes(col.id))) {
    setItems(columns.map(({ id }) => id));
  }

  const handleDragEnd = (event: any) => {
    const { operation, canceled } = event;
    const { source, target } = operation;

    if (canceled) return;

    if (target && isSortable(source)) {
      const newIndex = source.sortable.index;
      const oldIndex = source.sortable.initialIndex;

      if (oldIndex !== newIndex) {
        const newOrder = [...items];
        const [movedItem] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, movedItem);

        setItems(newOrder);
        if (onColumnOrderChange) {
          onColumnOrderChange(newOrder);
        }
      }
    }
  };

  return (
    <Dialog.Root>
      <Button variants={{ style: "bordered", size: "default" }}>
        <Columns3Cog className="size-5 stroke-1.5" />
        <span>{_(msg`cards-table.columns-menu.trigger`)}</span>
      </Button>
      <Dialog.Popover>
        <Dialog.Content variants={{ class: "gap-4 w-60" }}>
          <h3 className="fg-level-1 leading-10 font-semibold tracking-wide">
            {_(msg`cards-table.columns-menu.title`)}
          </h3>
          <DragDropProvider
            sensors={[KeyboardSensor, PointerSensor]}
            modifiers={[RestrictToVerticalAxis] as any[]}
            onDragEnd={handleDragEnd}
          >
            <div className="flex flex-col gap-2">
              {items.map((columnId, index) => {
                const column = columns.find(({ id }) => (id === columnId));
                if (!column?.getCanHide()) return null;

                return (
                  <Draggable variants={{ class: "gap-2" }} id={columnId} index={index} key={columnId}>
                    <Checkbox
                      variants={{ class: "grow overflow-hidden" }}
                      isSelected={column.getIsVisible()}
                      onChange={(isSelected) => onColumnVisibilityChange(column.id, isSelected)}
                    >
                      <Checkbox.Indicator />
                      <Checkbox.Label variants={{ class: "truncate" }}>
                        {column.columnDef.header?.toString() || column.id}
                      </Checkbox.Label>
                    </Checkbox>
                  </Draggable>
                );
              })}
            </div>
          </DragDropProvider>
        </Dialog.Content>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
