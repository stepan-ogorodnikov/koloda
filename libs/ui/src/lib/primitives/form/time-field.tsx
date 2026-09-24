import type { PropsWithChildren, ReactNode } from "react";
import { DateInput, DateSegment, TimeField as ReactAriaTimeField } from "react-aria-components";
import type { DateInputProps, TimeFieldProps as ReactAriaTimeFieldProps, TimeValue } from "react-aria-components";
import { tv } from "tailwind-variants";
import type { TWVProps } from "../../types";
import { AnimatedNumber } from "../animations/number";
import { Label } from "./label";
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

type TimeFieldProps = ReactAriaTimeFieldProps<TimeValue> &
  TWVProps<typeof timeField> &
  PropsWithChildren & {
    label?: ReactNode;
  };

export function TimeField({ variants, label, children, ...props }: TimeFieldProps) {
  return (
    <ReactAriaTimeField className={timeField(variants)} {...props}>
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
        >
          {({ type, text }) => {
            if (!["hour", "minute", "second"].includes(type)) return text;
            const value = Number.parseInt(text, 10);
            if (Number.isNaN(value)) return text;
            // WHY: parseInt drops the leading zero react-aria already chose. NumberFlow
            // would then render "5" for "05", and a fixed 2 would pad an unpadded hour.
            // text.length keeps the segment's own width.
            return <AnimatedNumber value={value} format={{ minimumIntegerDigits: text.length }} />;
          }}
        </DateSegment>
      )}
    </DateInput>
  );
}

TimeField.Input = TimeFieldInput;
