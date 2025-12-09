import { formLayoutSection, formLayoutSectionContent, useFieldContext } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import { Errors } from "@koloda/ui";
import type { ComponentProps, PropsWithChildren } from "react";
import { Input, TextArea, TextField as ReactAriaTextField } from "react-aria-components";
import type { InputProps, TextFieldProps as ReactAriaTextFieldProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const textField = tv({
  base: "flex flex-col",
  variants: {
    layout: {
      form: formLayoutSection(),
    },
  },
});

export type TextFieldProps = ReactAriaTextFieldProps & TWVProps<typeof textField>;

export function TextField({ variants, ...props }: TextFieldProps) {
  return <ReactAriaTextField className={textField(variants)} {...props} />;
}

export const textFieldInput = tv({
  base: [
    "min-w-0 h-10 p-2 border-0",
    "placeholder:fg-input-placeholder scrollbar-thin",
  ],
  variants: {
    style: {
      normal: "bg-input fg-level-1 border-input border-2 rounded-lg shadow-input focus-ring",
      group: "bg-transparent focus:outline-none",
      inline: "border-2 border-transparent rounded-lg focus-ring",
    },
    content: {
      number: "text-lg font-semibold tracking-wider",
    },
    layout: {
      form: [formLayoutSectionContent, "grow"],
    },
  },
  defaultVariants: {
    style: "normal",
  },
});

function TextFieldContent({ children }: PropsWithChildren) {
  return <div className="grow flex flex-col">{children}</div>;
}

export type TextFieldInputProps = InputProps & TWVProps<typeof textFieldInput>;

export function TextFieldInput({ variants, ...props }: TextFieldInputProps) {
  return <Input className={textFieldInput(variants)} {...props} />;
}

export const textFieldTextArea = tv({ extend: textFieldInput, base: "h-auto" });

export type TextFieldTextAreaProps = ComponentProps<typeof TextArea> & TWVProps<typeof textFieldTextArea>;

export function TextFieldTextArea({ variants, ...props }: TextFieldTextAreaProps) {
  return <TextArea className={textFieldTextArea(variants)} {...props} />;
}

export function FormTextField(props: TextFieldProps) {
  const field = useFieldContext<string>();

  return (
    <TextField
      value={field.state.value}
      onChange={field.handleChange}
      {...props}
    />
  );
}

TextField.Content = TextFieldContent;
TextField.Input = TextFieldInput;
TextField.TextArea = TextFieldTextArea;
TextField.Errors = Errors;
