import type { LessonTemplateLayoutItem } from "@koloda/srs";
import { Fade, TextField } from "@koloda/ui";
import { AnimatePresence, motion } from "motion/react";
import type { ActionDispatch } from "react";
import { tv } from "tailwind-variants";
import { LessonCardFieldTextDiff, lessonCardFieldValue } from "./lesson-card-field-text-diff";
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

type LessonCardFieldProps = {
  params: LessonTemplateLayoutItem;
  content: LessonReducerState["content"];
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonCardField(
  { params: { field, operation }, content, dispatch }: LessonCardFieldProps,
) {
  if (!field || !content) return null;

  const actualValue = content.card.content[field.id]?.text || "";
  const userValue = content.form.data[field.id] || "";

  return (
    <div
      className={lessonCardContentField({ operation })}
      data-is-submitted={content.form.isSubmitted || undefined}
    >
      {operation === "type"
        ? (
          <AnimatePresence mode="wait">
            {content.form.isSubmitted
              ? <LessonCardFieldTextDiff userValue={userValue} correctValue={actualValue} key="diff" />
              : (
                <Fade key="input">
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
                    <TextField.TextArea variants={{ class: lessonCardFieldValue }} />
                  </TextField>
                </Fade>
              )}
          </AnimatePresence>
        )
        : (
          <motion.div className={lessonCardFieldValue} layoutId={`${content.index}.${field.id}`}>
            {actualValue}
          </motion.div>
        )}
    </div>
  );
}
