import { Check } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Checkbox as ReactAriaCheckbox } from "react-aria-components";
import type { CheckboxProps as ReactAriaCheckboxProps } from "react-aria-components";
import { label } from "./label";

const checkbox = "group flex flex-row items-center gap-2 min-h-10 rounded-md focus-ring";

export type CheckboxProps = ReactAriaCheckboxProps & PropsWithChildren;

export function Checkbox(props: CheckboxProps) {
  return <ReactAriaCheckbox className={checkbox} {...props} />;
}

const checkboxIndicator = [
  "flex items-center justify-center size-5 rounded border-2 border-checkbox bg-checkbox shadow-checkbox",
  "group-selected:bg-checkbox-selected group-selected:border-checkbox-selected animate-colors",
].join(" ");

const checkboxIndicatorCheck = [
  "size-3 min-w-3 stroke-4 fg-checkbox-check opacity-0 group-selected:opacity-100 animate-opacity",
].join(" ");

function CheckboxIndicator() {
  return (
    <div className={checkboxIndicator}>
      <Check className={checkboxIndicatorCheck} />
    </div>
  );
}

function CheckboxLabel({ children }: PropsWithChildren) {
  return (
    <span className={label()}>
      {children}
    </span>
  );
}

Checkbox.Indicator = CheckboxIndicator;
Checkbox.Label = CheckboxLabel;
