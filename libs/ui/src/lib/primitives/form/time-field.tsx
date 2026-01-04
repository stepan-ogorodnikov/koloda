import { Label } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import type { PropsWithChildren, ReactNode } from "react";
import { DateInput, DateSegment, TimeField as ReactAriaTimeField } from "react-aria-components";
import type { DateInputProps, TimeFieldProps as ReactAriaTimeFieldProps, TimeValue } from "react-aria-components";
import { tv } from "tailwind-variants";
import { formLayoutSection } from "./form-layout";
import { textFieldInput } from "./text-field";

export const timeField = tv({
  base: "",
  variants: {
    layout: {
      form: formLayoutSection(),
    },
  },
});

type TimeFieldProps = ReactAriaTimeFieldProps<TimeValue> & TWVProps<typeof timeField> & PropsWithChildren & {
  label?: ReactNode;
};

export function TimeField({ variants, label, children, ...props }: TimeFieldProps) {
  return (
    <ReactAriaTimeField className={timeField(variants)} shouldForceLeadingZeros {...props}>
      {label && <Label variants={variants?.layout === "form" ? { layout: "form" } : {}}>{label}</Label>}
      {children}
    </ReactAriaTimeField>
  );
}

export const timeFieldSegment = tv({
  base: [textFieldInput({ content: "number" }), "flex items-center justify-center"],
  variants: {
    isLiteral: {
      true: "px-0 border-none shadow-none bg-transparent",
      false: "w-12",
    },
    isEmpty: {
      true: "hidden",
    },
  },
});

type TimeFieldInputProps = Omit<DateInputProps, "children">;

function TimeFieldInput(props: TimeFieldInputProps) {
  return (
    <DateInput className="flex flex-row gap-1" {...props}>
      {(segment) => (
        <DateSegment
          className={timeFieldSegment({
            isLiteral: segment.type === "literal",
            isEmpty: segment.type === "literal" && segment.isPlaceholder === false,
          })}
          segment={segment}
        />
      )}
    </DateInput>
  );
}

TimeField.Input = TimeFieldInput;
