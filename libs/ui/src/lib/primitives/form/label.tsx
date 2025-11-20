import type { TWVProps } from "@koloda/ui";
import { Label as ReactAriaLabel } from "react-aria-components";
import type { LabelProps as ReactAriaLabelProps } from "react-aria-components";
import { tv } from "tailwind-variants";
import { formLayoutSectionTerm } from "./form-layout";

export const label = tv({
  base: "py-2",
  variants: {
    layout: {
      form: formLayoutSectionTerm,
    },
  },
});

type LabelProps = ReactAriaLabelProps & TWVProps<typeof label>;

export function Label({ variants, ...props }: LabelProps) {
  return <ReactAriaLabel className={label(variants)} {...props} />;
}
