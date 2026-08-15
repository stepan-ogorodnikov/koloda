import type { TemplateFieldType, TemplateOperation } from "@koloda/srs";
import type { ComponentType } from "react";
import { LessonCardFieldMarkdown } from "./lesson-card-field-markdown";
import { LessonCardFieldText } from "./lesson-card-field-text";

export type FieldComponentProps = {
  value: string;
  operation: TemplateOperation;
  fieldId: number;
  fieldTitle: string;
  userValue: string;
  isSubmitted: boolean;
  isFirstInput: boolean;
  onFormChange: (value: string) => void;
  onSubmit: () => void;
};

export type FieldTypeComponentsMap = Record<TemplateFieldType, ComponentType<FieldComponentProps>>;

export const fieldTypeComponents: FieldTypeComponentsMap = {
  text: LessonCardFieldText,
  markdown: LessonCardFieldMarkdown,
};
