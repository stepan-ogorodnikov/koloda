import type { TemplateField, TemplateLayoutItem } from "@koloda/srs";
import { GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import type { PropsWithChildren } from "react";

type TemplateDraggableProps = PropsWithChildren & {
  data: TemplateField | TemplateLayoutItem;
};

export function TemplateDraggable({ data, children }: TemplateDraggableProps) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      className="py-2 px-4"
      as="tr"
      value={data}
      dragListener={false}
      dragControls={controls}
    >
      <td
        className="reorder-handle cursor-grab"
        onPointerDown={(e) => {
          controls.start(e);
        }}
      >
        <GripVertical className="size-5 fg-level-2 stroke-1.25" />
      </td>
      {children}
    </Reorder.Item>
  );
}
