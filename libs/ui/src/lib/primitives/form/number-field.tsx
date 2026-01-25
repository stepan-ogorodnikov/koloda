import type { TWVProps } from "@koloda/ui";
import { Number } from "@koloda/ui";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useContext, useRef, useState } from "react";
import { Button, NumberField as ReactAriaNumberField, NumberFieldStateContext } from "react-aria-components";
import type { ButtonProps, NumberFieldProps as ReactAriaNumberFieldProps } from "react-aria-components";
import { tv } from "tailwind-variants";
import { button } from "./button";
import { FieldGroup, fieldGroup } from "./field-group";
import type { TextFieldInputProps } from "./text-field";
import { textField, TextFieldInput, textFieldInput } from "./text-field";

export const numberField = tv({ extend: textField });

export type NumberFieldProps = ReactAriaNumberFieldProps & TWVProps<typeof numberField>;

export function NumberField({ variants, ...props }: NumberFieldProps) {
  return <ReactAriaNumberField className={numberField(variants)} formatOptions={{ useGrouping: false }} {...props} />;
}

export const numberFieldGroup = tv({
  extend: fieldGroup,
  variants: {
    size: {
      default: "max-w-48",
    },
  },
  defaultVariants: { size: "default", style: "input", focusable: true },
});

export type NumberFieldGroupProps = Omit<TextFieldInputProps, "variants"> & TWVProps<typeof numberFieldGroup>;

function NumberFieldGroup({ variants, ...props }: NumberFieldGroupProps) {
  return (
    <FieldGroup className={numberFieldGroup(variants)}>
      <NumberFieldInput {...props} />
      <NumberFieldDecrement>
        <MinusIcon className="size-4" />
      </NumberFieldDecrement>
      <NumberFieldIncrement>
        <PlusIcon className="size-4" />
      </NumberFieldIncrement>
    </FieldGroup>
  );
}

const numberFieldInput = tv({
  extend: textFieldInput,
  base: "w-auto pe-0 leading-[1em]",
  variants: {
    showCaret: {
      true: "caret-fg-level-1",
      false: "caret-transparent",
    },
    isInput: {
      true: "spin-hide text-transparent",
      false: "pointer-events-none",
    },
  },
  defaultVariants: {
    style: "group",
    content: "number",
  },
});

type NumberFieldInputProps = TWVProps<typeof numberFieldInput> & TextFieldInputProps;

function NumberFieldInput(props: NumberFieldInputProps) {
  const state = useContext(NumberFieldStateContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAnimated, setIsAnimated] = useState(true);
  const [showCaret, setShowCaret] = useState(true);

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = () => {
    setIsAnimated(false);
    queueMicrotask(() => setIsAnimated(true));
  };

  const handleBlur: React.ChangeEventHandler<HTMLInputElement> = ({ currentTarget: { value } }) => {
    if (value === "") state?.decrementToMin();
  };

  return (
    <div className="relative grid [grid-template-areas:'overlap'] *:[grid-area:overlap]">
      <TextFieldInput
        className={numberFieldInput({ showCaret, isInput: true })}
        style={{ fontKerning: "none" }}
        ref={inputRef}
        onChange={handleInputChange}
        onBlur={handleBlur}
        {...props}
      />
      <Number
        className={numberFieldInput({ isInput: false })}
        value={state?.numberValue || 0}
        format={{ useGrouping: false }}
        aria-hidden="true"
        animated={isAnimated}
        onAnimationsStart={() => setShowCaret(false)}
        onAnimationsFinish={() => setShowCaret(true)}
        willChange
      />
    </div>
  );
}

const numberFieldButton = button({
  size: "none",
  style: "ghost",
  class: "p-2 rounded-none hover:bg-transparent hover:fg-level-1",
});

function NumberFieldIncrement(props: ButtonProps) {
  return <Button className={numberFieldButton} slot="increment" {...props} />;
}

function NumberFieldDecrement(props: ButtonProps) {
  return <Button className={numberFieldButton} slot="decrement" {...props} />;
}

NumberField.Input = NumberFieldInput;
NumberField.Increment = NumberFieldIncrement;
NumberField.Decrement = NumberFieldDecrement;
NumberField.Group = NumberFieldGroup;
