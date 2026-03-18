import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
import { DragDropProvider, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_FIELD, getNextNumericId } from "@koloda/srs";
import type { UpdateTemplateValues } from "@koloda/srs";
import { Button, Draggable, withForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { TemplateFieldsItem } from "./template-fields-item";

export const TemplateFields = withForm({
  defaultValues: DEFAULT_TEMPLATE as UpdateTemplateValues,
  props: { isLocked: false },
  render: function Render({ form, isLocked }) {
    const { _ } = useLingui();
    const fieldsValue = useStore(form.store, (state) => state.values?.content?.fields);
    const layoutValue = useStore(form.store, (state) => state.values?.content?.layout);

    return (
      <form.Field name="content.fields" mode="array">
        {(field) => (
          <DragDropProvider
            sensors={[KeyboardSensor, PointerSensor]}
            modifiers={[RestrictToVerticalAxis] as any[]}
            onDragEnd={(event) => {
              const { operation, canceled } = event;
              const { source, target } = operation;

              if (canceled) return;

              if (target && isSortable(source)) {
                const newIndex = source.sortable.index;
                const oldIndex = source.sortable.initialIndex;
                if (oldIndex !== newIndex) field.moveValue(oldIndex, newIndex);
              }
            }}
          >
            <div className="flex flex-col gap-2">
              {field.state.value.map((item, i) => (
                <Draggable id={item.id} index={i} key={item.id}>
                  <div className="flex flex-row flex-wrap">
                    <TemplateFieldsItem
                      index={i}
                      isLocked={isLocked}
                      form={form}
                      onDelete={() => {
                        field.removeValue(i);
                        form.setFieldValue("content.layout", layoutValue.filter((x) => x.field !== item.id));
                      }}
                    />
                  </div>
                </Draggable>
              ))}
              {!isLocked && (
                <div>
                  <Button
                    variants={{ style: "dashed", class: "justify-start gap-4 w-full px-1" }}
                    onClick={() => {
                      const id = getNextNumericId(fieldsValue);
                      field.pushValue({ ...DEFAULT_TEMPLATE_FIELD, id });
                      form.pushFieldValue("content.layout", { field: id, operation: "display" });
                    }}
                  >
                    <Plus className="size-4 mx-0.5" />
                    {_(msg`template.fields.add-item`)}
                  </Button>
                </div>
              )}
            </div>
          </DragDropProvider>
        )}
      </form.Field>
    );
  },
});
