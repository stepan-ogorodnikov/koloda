import { markdownToHtml } from "@koloda/srs";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { FieldComponentProps } from "./lesson-card-field-types";

export function LessonCardFieldMarkdown({ value }: FieldComponentProps) {
  const html = useMemo(() => markdownToHtml(value), [value]);

  return <motion.div dangerouslySetInnerHTML={{ __html: html }} layout />;
}
