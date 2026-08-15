import { Fade, TextField } from "@koloda/ui";
import { AnimatePresence, motion } from "motion/react";
import { LessonCardFieldTextDiff } from "./lesson-card-field-text-diff";
import type { FieldComponentProps } from "./lesson-card-field-types";

const lessonCardFieldValue = "break-all whitespace-pre-wrap text-center";

export function LessonCardFieldText({
  value,
  operation,
  fieldTitle,
  userValue,
  isSubmitted,
  isFirstInput,
  onFormChange,
  onSubmit,
}: FieldComponentProps) {
  if (operation === "type") {
    return (
      <AnimatePresence mode="wait">
        {isSubmitted ? (
          <Fade className={lessonCardFieldValue} key="diff">
            <LessonCardFieldTextDiff userValue={userValue} correctValue={value} />
          </Fade>
        ) : (
          <Fade className={lessonCardFieldValue} key="input">
            <TextField
              aria-label={fieldTitle}
              value={userValue}
              onChange={onFormChange}
              autoFocus={isFirstInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                  e.preventDefault();
                  onSubmit();
                }
                e.continuePropagation();
              }}
            >
              <TextField.TextArea autoResize rows={1} maxRows={10} />
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
