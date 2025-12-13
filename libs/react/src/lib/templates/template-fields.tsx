import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
import { DragDropProvider, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_FIELD, getNextNumericId } from "@koloda/srs";
import type { TemplateField, UpdateTemplateValues } from "@koloda/srs";
import { Button, Draggable, TextField, withForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { Plus, Trash2 } from "lucide-react";

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
                  <form.Field name={`content.fields[${i}].title`}>
                    {(fieldItemTitleField) => (
                      <TemplateField
                        title={fieldsValue[i].title}
                        onTitleChange={fieldItemTitleField.handleChange}
                        isLocked={isLocked}
                        onDelete={() => {
                          field.removeValue(i);
                          form.setFieldValue("content.layout", layoutValue.filter((x) => x.field !== item.id));
                        }}
                      />
                    )}
                  </form.Field>
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
                    {_(msg`template.inputs.fields.add`)}
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

type TemplateFieldProps = {
  title: string;
  onTitleChange?: (x: string) => void;
  isLocked?: boolean | null;
  onDelete?: () => void;
};

function TemplateField({ title, onTitleChange, isLocked, onDelete }: TemplateFieldProps) {
  const { _ } = useLingui();

  return (
    <>
      <TextField
        aria-label={_(msg`template.inputs.fields.title.label`)}
        value={title}
        onChange={onTitleChange}
      >
        <TextField.Input
          variants={{ style: "inline", class: "dt:w-72" }}
          placeholder={_(msg`template.inputs.fields.title.placeholder`)}
        />
      </TextField>
      {!isLocked && (
        <Button
          variants={{ style: "ghost", size: "icon" }}
          onClick={onDelete}
        >
          <Trash2 className="stroke-1.75" />
        </Button>
      )}
    </>
  );
}
