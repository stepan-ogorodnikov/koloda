import { markdownToHtml } from "@koloda/srs";
import { motion } from "motion/react";
import { useMemo, useRef } from "react";
import type { FieldComponentProps } from "./lesson-card-field-types";
import { useAttachmentImages } from "./use-attachment-images";

export function LessonCardFieldMarkdown({ value }: FieldComponentProps) {
  const html = useMemo(() => markdownToHtml(value, { shouldKeepAttachmentImages: true }), [value]);
  const ref = useRef<HTMLDivElement>(null);
  useAttachmentImages(ref, html);

  return <motion.div ref={ref} dangerouslySetInnerHTML={{ __html: html }} layout />;
}
