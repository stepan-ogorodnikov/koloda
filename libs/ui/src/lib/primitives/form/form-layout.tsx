import type { TWVProps } from "@koloda/ui";
import type { ReactNode } from "react";
import { type HTMLAttributes } from "react";
import { tv } from "tailwind-variants";

export const formLayout = "grow flex flex-col py-2 px-4";

type FormLayoutProps = HTMLAttributes<HTMLDivElement>;

export function FormLayout({ children }: FormLayoutProps) {
  return <div className={formLayout}>{children}</div>;
}

export const formLayoutSection = tv({
  base: "flex flex-col tb:flex-row flex-wrap tb:items-baseline tb:gap-4 py-2",
});

type FormLayoutSectionProps =
  & HTMLAttributes<HTMLDivElement>
  & TWVProps<typeof formLayoutSection>
  & {
    term?: ReactNode;
  };

export function FormLayoutSection({ variants, term, children, ...props }: FormLayoutSectionProps) {
  if (term) {
    return (
      <div className={formLayoutSection(variants)}>
        <FormLayoutSectionTerm>{term}</FormLayoutSectionTerm>
        <FormLayoutSectionContent>
          {children}
        </FormLayoutSectionContent>
      </div>
    );
  }

  return <div className={formLayoutSection(variants)} {...props}>{children}</div>;
}

export const formLayoutSectionTerm = "flex tb:basis-48 dt:basis-60 shrink-0 py-2 font-semibold fg-level-2";

type FormLayoutSectionTermProps = HTMLAttributes<HTMLLegendElement>;

export function FormLayoutSectionTerm(props: FormLayoutSectionTermProps) {
  return <div className={formLayoutSectionTerm} {...props} />;
}

export const formLayoutSectionContent = tv({ base: "flex flex-col items-baseline" });

type FormLayoutSectionContentProps = HTMLAttributes<HTMLDivElement> & TWVProps<typeof formLayoutSectionContent>;

export function FormLayoutSectionContent({ variants, ...props }: FormLayoutSectionContentProps) {
  return <div className={formLayoutSectionContent(variants)} {...props} />;
}

FormLayout.Section = FormLayoutSection;
FormLayoutSection.Term = FormLayoutSectionTerm;
FormLayoutSection.Content = FormLayoutSectionContent;
