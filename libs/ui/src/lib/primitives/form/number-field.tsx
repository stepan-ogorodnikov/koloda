import type { TWVProps } from "@koloda/ui";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button, NumberField as ReactAriaNumberField } from "react-aria-components";
import type { ButtonProps, NumberFieldProps as ReactAriaNumberFieldProps } from "react-aria-components";
import { tv } from "tailwind-variants";
import { button } from "./button";
import { FieldGroup, fieldGroup } from "./field-group";
import type { TextFieldInputProps } from "./text-field";
import { textField, TextFieldInput } from "./text-field";

export const numberField = tv({ extend: textField });

export type NumberFieldProps = ReactAriaNumberFieldProps & TWVProps<typeof numberField>;

export function NumberField({ variants, ...props }: NumberFieldProps) {
  return <ReactAriaNumberField className={numberField(variants)} {...props} />;
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

function NumberFieldInput(props: TextFieldInputProps) {
  return <TextFieldInput variants={{ style: "group", content: "number", class: "w-auto pe-0" }} {...props} />;
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
