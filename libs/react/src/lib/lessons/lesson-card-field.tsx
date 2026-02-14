import type { LessonTemplateLayoutItem } from "@koloda/srs";
import { LayoutGroup } from "motion/react";
import type { ActionDispatch } from "react";
import { tv } from "tailwind-variants";
import { fieldTypeComponents } from "./lesson-card-field-types";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

const lessonCardContentField = tv({
  base: "w-full text-xl text-center",
  variants: {
    operation: {
      display: "",
      reveal: "opacity-0 data-is-submitted:opacity-100 animate-opacity",
      type: "flex flex-col",
    },
  },
});

type LessonCardFieldProps = {
  params: LessonTemplateLayoutItem;
  content: LessonReducerState["content"];
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonCardField({ params: { field, operation }, content, dispatch }: LessonCardFieldProps) {
  if (!field || !content) return null;

  const actualValue = content.card.content[field.id]?.text || "";
  const userValue = content.form.data[field.id] || "";
  const FieldComponent = fieldTypeComponents[field.type];

  return (
    <LayoutGroup>
      <div
        className={lessonCardContentField({ operation })}
        data-is-submitted={content.form.isSubmitted || undefined}
      >
        <FieldComponent
          value={actualValue}
          operation={operation}
          fieldId={field.id}
          fieldTitle={field.title}
          userValue={userValue}
          isSubmitted={content.form.isSubmitted}
          isFirstInput={field.id === content.form.firstInputFieldId}
          dispatch={dispatch}
        />
      </div>
    </LayoutGroup>
  );
}
