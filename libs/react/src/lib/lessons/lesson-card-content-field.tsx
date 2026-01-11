import type { LessonTemplateLayoutItem } from "@koloda/srs";
import { TextField } from "@koloda/ui";
import type { ActionDispatch } from "react";
import { tv } from "tailwind-variants";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

const lessonCardContentField = tv({
  base: "text-xl",
  variants: {
    operation: {
      display: "",
      reveal: "hidden data-is-submitted:flex",
      type: "flex flex-col gap-2",
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
              ? (
                <>
                  <div>{userValue}</div>
                  <div>{actualValue}</div>
                </>
              )
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
                  <TextField.Input />
                </TextField>
              )}
          </>
        )
        : actualValue}
    </div>
  );
}
