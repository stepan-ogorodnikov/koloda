import { Delete03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TemplateFieldType } from "@koloda/srs";
import type { UpdateTemplateValues } from "@koloda/srs";
import { DEFAULT_TEMPLATE, TEMPLATE_FIELD_TYPES_MESSAGES } from "@koloda/srs";
import { Checkbox, withForm } from "@koloda/ui";
import { Button, Select, TextField } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export const TemplateFieldsItem = withForm({
  defaultValues: DEFAULT_TEMPLATE as UpdateTemplateValues,
  props: { isLocked: false, index: 0, onDelete: () => {} },
  render: function Render({ form, isLocked, index, onDelete }) {
    const { _ } = useLingui();

    return (
      <>
        <form.Field name={`content.fields[${index}].title`}>
          {(field) => (
            <TextField
              aria-label={_(msg`template.fields.inputs.title.label`)}
              value={field.state.value as string}
              onChange={field.handleChange}
            >
              <TextField.Input
                variants={{ style: "inline", class: "dt:w-72" }}
                placeholder={_(msg`template.fields.inputs.title.placeholder`)}
              />
            </TextField>
          )}
        </form.Field>
        <form.Field name={`content.fields[${index}].type`}>
          {(field) => (
            <Select.Root
              aria-label={_(msg`template.fields.inputs.type.label`)}
              value={field.state.value as string}
              isDisabled={isLocked ?? undefined}
              onChange={(e) => {
                if (typeof e === "string") field.handleChange(e as TemplateFieldType);
              }}
            >
              <Select.Button variants={{ style: "ghost", class: "w-48" }} />
              <Select.Popover>
                <Select.ListBox>
                  {TEMPLATE_FIELD_TYPES_MESSAGES.map(({ id, value }) => (
                    <Select.ListBoxItem id={id} textValue={_(value)} key={id}>
                      {_(value)}
                    </Select.ListBoxItem>
                  ))}
                </Select.ListBox>
              </Select.Popover>
            </Select.Root>
          )}
        </form.Field>
        <form.Field name={`content.fields[${index}].isRequired`}>
          {(field) => (
            <Checkbox
              variants={{ class: "mx-2 overflow-hidden" }}
              isDisabled={isLocked}
              isSelected={field.state.value}
              onChange={field.handleChange}
            >
              <Checkbox.Indicator />
              <Checkbox.Label variants={{ class: "fg-level-2 truncate" }}>
                {_(msg`template.fields.inputs.is-required.label`)}
              </Checkbox.Label>
            </Checkbox>
          )}
        </form.Field>
        {!isLocked && (
          <Button
            aria-label={_(msg`template.fields.delete-item.label`)}
            variants={{ style: "ghost", size: "icon" }}
            onClick={onDelete}
          >
            <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Delete03Icon} aria-hidden="true" />
          </Button>
        )}
      </>
    );
  },
});
