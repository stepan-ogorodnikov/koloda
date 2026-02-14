import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
import { DragDropProvider, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_FIELD, getNextNumericId } from "@koloda/srs";
import type { TemplateFieldType, UpdateTemplateValues } from "@koloda/srs";
import { Button, Draggable, Select, TextField, withForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { Plus, Trash2 } from "lucide-react";

const fieldTypes = [
  { id: "text", value: msg`templates.field-types.text` },
  { id: "markdown", value: msg`templates.field-types.markdown` },
];

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
                    {(titleField) => (
                      <form.Field name={`content.fields[${i}].type`}>
                        {(typeField) => (
                          <TemplateFieldItem
                            title={fieldsValue[i].title}
                            type={fieldsValue[i].type}
                            onTitleChange={titleField.handleChange}
                            onTypeChange={(value) => typeField.handleChange(value as TemplateFieldType)}
                            isLocked={isLocked}
                            onDelete={() => {
                              field.removeValue(i);
                              form.setFieldValue("content.layout", layoutValue.filter((x) => x.field !== item.id));
                            }}
                          />
                        )}
                      </form.Field>
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

type TemplateFieldItemProps = {
  title: string;
  type: TemplateFieldType;
  onTitleChange?: (x: string) => void;
  onTypeChange?: (x: TemplateFieldType) => void;
  isLocked?: boolean | null;
  onDelete?: () => void;
};

function TemplateFieldItem({ title, type, onTitleChange, onTypeChange, isLocked, onDelete }: TemplateFieldItemProps) {
  const { _ } = useLingui();

  return (
    <>
      <TextField
        aria-label={_(msg`template.fields.inputs.title.label`)}
        value={title}
        onChange={onTitleChange}
      >
        <TextField.Input
          variants={{ style: "inline", class: "dt:w-72" }}
          placeholder={_(msg`template.fields.inputs.title.placeholder`)}
        />
      </TextField>
      <Select.Root
        aria-label={_(msg`template.fields.inputs.type.label`)}
        value={type}
        onChange={(e) => {
          if (typeof e === "string") onTypeChange?.(e as TemplateFieldType);
        }}
      >
        <Select.Button variants={{ style: "ghost", class: "w-48" }} />
        <Select.Popover>
          <Select.ListBox>
            {fieldTypes.map(({ id, value }) => (
              <Select.ListBoxItem id={id} textValue={_(value)} key={id}>
                {_(value)}
              </Select.ListBoxItem>
            ))}
          </Select.ListBox>
        </Select.Popover>
      </Select.Root>
      {!isLocked && (
        <Button
          aria-label={_(msg`template.fields.delete-item.label`)}
          variants={{ style: "ghost", size: "icon" }}
          onClick={onDelete}
        >
          <Trash2 className="stroke-1.75" />
        </Button>
      )}
    </>
  );
}
