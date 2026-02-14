import { markdownToHtml } from "@koloda/srs";
import { motion } from "motion/react";
import type { FieldComponentProps } from "./lesson-card-field-types";

export function LessonCardFieldMarkdown({ value }: FieldComponentProps) {
  const html = markdownToHtml(value);

  return (
    <motion.div
      className="prose dark:prose-invert max-w-none text-left"
      dangerouslySetInnerHTML={{ __html: html }}
      layout
    />
  );
}
