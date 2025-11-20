import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
import { DragDropProvider, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { DEFAULT_TEMPLATE, getTemplateFieldTitleById } from "@koloda/srs";
import type { TemplateOperation, UpdateTemplateValues } from "@koloda/srs";
import { withForm } from "@koloda/ui";
import { Draggable, Select, TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";

const operations = [
  { id: "display", value: msg`templates.operations.display` },
  { id: "reveal", value: msg`templates.operations.reveal` },
  { id: "type", value: msg`templates.operations.type` },
];

export const TemplateLayout = withForm({
  defaultValues: DEFAULT_TEMPLATE as UpdateTemplateValues,
  render: function Render({ form }) {
    const { _ } = useLingui();
    const fieldsValue = useStore(form.store, (state) => state.values.content.fields);

    return (
      <form.Field name="content.layout" mode="array">
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
            <div className="divide-y-1 divide-dotted divide-border-main">
              {field.state.value.map((item, i) => (
                <Draggable id={item.field} index={i} key={item.field}>
                  <TextField
                    aria-label={_(msg`template.inputs.layout.field.label`)}
                    value={getTemplateFieldTitleById(fieldsValue, field.state.value[i].field)}
                    isReadOnly
                    isDisabled
                  >
                    <TextField.Input
                      variants={{ style: "inline", class: "w-72" }}
                      placeholder={_(msg`template.inputs.layout.field.placeholder`)}
                    />
                  </TextField>
                  <form.Field name={`content.layout[${i}].operation`}>
                    {(operationField) => (
                      <Select.Root
                        aria-label={_(msg`template.inputs.layout.operation.label`)}
                        selectedKey={operationField.state.value}
                        onSelectionChange={(e) => {
                          if (typeof e === "string") operationField.handleChange(e as TemplateOperation);
                        }}
                      >
                        <Select.Button variants={{ style: "ghost", class: "w-48" }} />
                        <Select.Popover>
                          <Select.ListBox>
                            {operations.map(({ id, value }) => (
                              <Select.ListBoxItem id={id} textValue={_(value)} key={id}>
                                {_(value)}
                              </Select.ListBoxItem>
                            ))}
                          </Select.ListBox>
                        </Select.Popover>
                      </Select.Root>
                    )}
                  </form.Field>
                </Draggable>
              ))}
            </div>
          </DragDropProvider>
        )}
      </form.Field>
    );
  },
});
