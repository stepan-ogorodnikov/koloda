import { DEFAULT_FSRS_ALGORITHM, LEARNING_STEPS_UNITS } from "@koloda/srs";
import { Button, FieldGroup, NumberField, Select, withForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Plus, Trash2 } from "lucide-react";

const defaultValues = { title: "", content: DEFAULT_FSRS_ALGORITHM };

export const AlgorithmLearningSteps = withForm({
  defaultValues,
  props: { type: "learningSteps" as "learningSteps" | "relearningSteps" },
  render: function Render({ form, type }) {
    const { _ } = useLingui();

    return (
      <form.Field name={`content.${type}`} mode="array">
        {(field) => (
          <div className="flex flex-row flex-wrap gap-2">
            {field.state.value.map((_item, i) => (
              <FieldGroup variants={{ style: "input" }} key={i}>
                <form.Field name={`content.${type}[${i}][0]`}>
                  {(field) => (
                    <NumberField
                      variants={{ class: "flex-row w-28" }}
                      aria-label={_(
                        type === "learningSteps"
                          ? msg`algorithm.learning-steps.amount.${i + 1}`
                          : msg`algorithm.relearning-steps.amount.${i + 1}`,
                      )}
                      minValue={1}
                      value={field.state.value}
                      onChange={field.handleChange}
                    >
                      <NumberField.Group variants={{ style: "ghost" }} />
                    </NumberField>
                  )}
                </form.Field>
                <form.Field name={`content.${type}[${i}][1]`}>
                  {(field) => (
                    <Select.Root
                      aria-label={_(
                        type === "learningSteps"
                          ? msg`algorithm.learning-steps.unit.${i + 1}`
                          : msg`algorithm.relearning-steps.unit.${i + 1}`,
                      )}
                      value={field.state.value}
                      onChange={(i) => field.handleChange(i as unknown as "s" | "m" | "h" | "d")}
                    >
                      <Select.Button variants={{ style: "ghost" }}>
                        <Select.Value>
                          {({ selectedText }) => selectedText}
                        </Select.Value>
                      </Select.Button>
                      <Select.Popover variants={{ class: "min-w-36" }}>
                        <Select.ListBox>
                          {LEARNING_STEPS_UNITS.map(({ id, short, long }) => (
                            <Select.ListBoxItem id={id} textValue={_(short)} key={id}>
                              {_(long)}
                            </Select.ListBoxItem>
                          ))}
                        </Select.ListBox>
                      </Select.Popover>
                    </Select.Root>
                  )}
                </form.Field>
                <Button
                  variants={{ style: "ghost", size: "icon" }}
                  aria-label={_(
                    type === "learningSteps"
                      ? msg`algorithm.learning-steps.delete.${i + 1}`
                      : msg`algorithm.relearning-steps.delete.${i + 1}`,
                  )}
                  onClick={() => {
                    field.removeValue(i);
                  }}
                >
                  <Trash2 className="size-4 min-w-4 mx-0.5" />
                </Button>
              </FieldGroup>
            ))}
            <Button
              variants={{ style: "dashed", size: "icon" }}
              aria-label={_(
                type === "learningSteps"
                  ? msg`algorithm.learning-steps.add`
                  : msg`algorithm.relearning-steps.add`,
              )}
              onClick={() => {
                field.pushValue(field.state.value[field.state.value.length - 1] || DEFAULT_FSRS_ALGORITHM[type][0]);
              }}
            >
              <Plus className="size-4 min-w-4 mx-0.5" />
            </Button>
          </div>
        )}
      </form.Field>
    );
  },
});
