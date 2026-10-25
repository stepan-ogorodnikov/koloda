import type { LessonTemplateLayoutItem } from "@koloda/srs";
import { LayoutGroup } from "motion/react";
import { tv } from "tailwind-variants";
import { fieldTypeComponents } from "./lesson-card-field-types";
import type { LessonContent } from "./lesson-reducer";

const lessonCardContentField = tv({
  base: "flex flex-col w-full prose wd:prose-xl",
  variants: {
    isHiddenUntilSubmit: {
      true: "opacity-0 data-is-submitted:opacity-100 animate-opacity",
    },
  },
});

export type LessonCardFieldProps = {
  params: LessonTemplateLayoutItem;
  content: LessonContent | null | undefined;
  onFormChange: (key: string, value: string) => void;
  onSubmit: () => void;
};

export function LessonCardField({
  params: { field, operation },
  content,
  onFormChange,
  onSubmit,
}: LessonCardFieldProps) {
  if (!field || !content) return null;

  // WHY: a markdown field has no typing input, so a "type" item on it hides its value until submit,
  // like reveal (LESSONS.md §Field Operations).
  const isHiddenUntilSubmit = operation === "reveal" || (operation === "type" && field.type !== "text");
  const actualValue = content.card.content[field.id]?.text || "";
  const userValue = content.form.data[field.id] || "";
  const FieldComponent = fieldTypeComponents[field.type];

  return (
    <LayoutGroup>
      <div
        className={lessonCardContentField({ isHiddenUntilSubmit })}
        data-is-submitted={content.form.isSubmitted || undefined}
        // WHY: transparency alone leaves the answer to screen readers, selection, and find-in-page.
        inert={isHiddenUntilSubmit && !content.form.isSubmitted}
      >
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
