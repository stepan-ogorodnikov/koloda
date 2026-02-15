import { markdownToHtml } from "@koloda/srs";
import { motion } from "motion/react";
import type { FieldComponentProps } from "./lesson-card-field-types";

export function LessonCardFieldMarkdown({ value }: FieldComponentProps) {
  const html = markdownToHtml(value);

  return (
    <motion.div
      dangerouslySetInnerHTML={{ __html: html }}
      layout
    />
  );
}
