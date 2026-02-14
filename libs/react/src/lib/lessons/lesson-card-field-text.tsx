import { Fade, TextField } from "@koloda/ui";
import { AnimatePresence, motion } from "motion/react";
import { LessonCardFieldTextDiff, lessonCardFieldValue } from "./lesson-card-field-text-diff";
import type { FieldComponentProps } from "./lesson-card-field-types";

export function LessonCardFieldText(
  { value, operation, fieldId, fieldTitle, userValue, isSubmitted, isFirstInput, dispatch }: FieldComponentProps,
) {
  if (operation === "type") {
    return (
      <AnimatePresence mode="wait">
        {isSubmitted
          ? (
            <Fade key="diff">
              <LessonCardFieldTextDiff userValue={userValue} correctValue={value} />
            </Fade>
          )
          : (
            <Fade key="input">
              <TextField
                aria-label={fieldTitle}
                value={userValue}
                onChange={(val) => dispatch(["cardFormUpdated", { key: fieldId, value: val }])}
                autoFocus={isFirstInput}
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
    );
  }

  return (
    <motion.div className={lessonCardFieldValue} layout>
      {value}
    </motion.div>
  );
}
