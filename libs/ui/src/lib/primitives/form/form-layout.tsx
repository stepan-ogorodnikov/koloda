import type { ReactNode } from "react";
import { type HTMLAttributes, type LabelHTMLAttributes } from "react";

export const formLayout = "grow flex flex-col py-2 px-6";

type FormLayoutProps = HTMLAttributes<HTMLDivElement>;

export function FormLayout({ children }: FormLayoutProps) {
  return <div className={formLayout}>{children}</div>;
}

export const formLayoutSection = "flex flex-row flex-wrap items-baseline gap-4 py-2";

type FormLayoutSectionProps = HTMLAttributes<HTMLDivElement> & { term?: ReactNode };

export function FormLayoutSection({ term, children }: FormLayoutSectionProps) {
  if (term) {
    return (
      <div className={formLayoutSection}>
        <FormLayoutSectionTerm>{term}</FormLayoutSectionTerm>
        <FormLayoutSectionContent>
          {children}
        </FormLayoutSectionContent>
      </div>
    );
  }
  return <div className={formLayoutSection}>{children}</div>;
}

export const formLayoutSectionTerm = "basis-60 font-semibold";

type FormLayoutSectionTermProps = LabelHTMLAttributes<HTMLDivElement>;

export function FormLayoutSectionTerm(props: FormLayoutSectionTermProps) {
  return <div className={formLayoutSectionTerm} {...props} />;
}

export const formLayoutSectionContent = "basis-180 flex flex-col items-baseline gap-4";

type FormLayoutSectionContentProps = HTMLAttributes<HTMLDivElement>;

export function FormLayoutSectionContent(props: FormLayoutSectionContentProps) {
  return <div className={formLayoutSectionContent} {...props} />;
}

FormLayout.Section = FormLayoutSection;
FormLayoutSection.Term = FormLayoutSectionTerm;
FormLayoutSection.Content = FormLayoutSectionContent;
