import type { LessonTemplateLayoutItem } from "@koloda/srs";
import { LayoutGroup } from "motion/react";
import { tv } from "tailwind-variants";
import { fieldTypeComponents } from "./lesson-card-field-types";
import type { LessonContent } from "./lesson-reducer";

const lessonCardContentField = tv({
  base: "flex flex-col w-full prose wd:prose-xl",
  variants: {
    operation: {
      display: "",
      reveal: "opacity-0 data-is-submitted:opacity-100 animate-opacity",
      type: "",
    },
  },
});

type LessonCardFieldProps = {
  params: LessonTemplateLayoutItem;
  content: LessonContent | null | undefined;
  onFormChange: (key: number | string, value: string) => void;
  onSubmit: () => void;
};

export function LessonCardField({
  params: { field, operation },
  content,
  onFormChange,
  onSubmit,
}: LessonCardFieldProps) {
  if (!field || !content) return null;

  const actualValue = content.card.content[field.id]?.text || "";
  const userValue = content.form.data[field.id] || "";
  const FieldComponent = fieldTypeComponents[field.type];

  return (
    <LayoutGroup>
      <div className={lessonCardContentField({ operation })} data-is-submitted={content.form.isSubmitted || undefined}>
        <FieldComponent
          value={actualValue}
          operation={operation}
          fieldId={field.id}
          fieldTitle={field.title}
          userValue={userValue}
          isSubmitted={content.form.isSubmitted}
          isFirstInput={field.id === content.form.firstInputFieldId}
          onFormChange={(val) => onFormChange(field.id, val)}
          onSubmit={onSubmit}
        />
      </div>
    </LayoutGroup>
  );
}
