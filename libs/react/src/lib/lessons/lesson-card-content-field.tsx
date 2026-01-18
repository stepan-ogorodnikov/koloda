import type { LessonTemplateLayoutItem } from "@koloda/srs";
import { TextField } from "@koloda/ui";
import type { ActionDispatch } from "react";
import { tv } from "tailwind-variants";
import { LessonCardContentFieldTextDiff, lessonCardContentFieldValue } from "./lesson-card-content-field-text-diff";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

const lessonCardContentField = tv({
  base: "w-full text-xl text-center",
  variants: {
    operation: {
      display: "",
      reveal: "hidden data-is-submitted:flex",
      type: "flex flex-col",
    },
  },
});

type LessonCardContentFieldProps = {
  params: LessonTemplateLayoutItem;
  content: LessonReducerState["content"];
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonCardContentField(
  { params: { field, operation }, content, dispatch }: LessonCardContentFieldProps,
) {
  if (!field || !content) return null;

  const actualValue = content.card.content[field.id]?.text || "";
  const userValue = content.form.data[field.id] || "";

  return (
    <div className={lessonCardContentField({ operation })} data-is-submitted={content.form.isSubmitted || undefined}>
      {operation === "type"
        ? (
          <>
            {content.form.isSubmitted
              ? <LessonCardContentFieldTextDiff userValue={userValue} correctValue={actualValue} />
              : (
                <TextField
                  aria-label={field.title}
                  value={userValue}
                  onChange={(value) => dispatch(["cardFormUpdated", { key: field.id, value }])}
                  autoFocus={field.id === content.form.firstInputFieldId}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      dispatch(["cardSubmitted"]);
                    }
                  }}
                >
                  <TextField.TextArea variants={{ class: lessonCardContentFieldValue }} />
                </TextField>
              )}
          </>
        )
        : <div className={lessonCardContentFieldValue}>{actualValue}</div>}
    </div>
  );
}
