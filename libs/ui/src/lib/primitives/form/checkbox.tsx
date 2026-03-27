import { MinusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TWVProps } from "@koloda/ui";
import type { PropsWithChildren } from "react";
import { Checkbox as ReactAriaCheckbox } from "react-aria-components";
import type { CheckboxProps as ReactAriaCheckboxProps } from "react-aria-components";
import { tv } from "tailwind-variants";
import { label } from "./label";

const checkbox = tv({ base: "group flex flex-row items-center gap-2 min-size-10 rounded-md focus-ring" });

export type CheckboxProps = ReactAriaCheckboxProps & TWVProps<typeof checkbox> & PropsWithChildren;

export function Checkbox({ variants, ...props }: CheckboxProps) {
  return <ReactAriaCheckbox className={checkbox(variants)} {...props} />;
}

const checkboxIndicator = [
  "flex items-center justify-center size-5 min-w-5 rounded border-2 border-checkbox bg-checkbox shadow-checkbox",
  "group-selected:bg-checkbox-selected group-selected:border-checkbox-selected",
  "group-indeterminate:bg-checkbox-selected group-indeterminate:border-checkbox-selected",
  "animate-colors",
].join(" ");

const checkboxIndicatorCheck = [
  "absolute size-3 min-w-3 fg-checkbox-check opacity-0 group-selected:opacity-100 animate-opacity",
].join(" ");

const checkboxIndicatorMinus = [
  "absolute size-3 min-w-3 fg-checkbox-check opacity-0 group-indeterminate:opacity-100 animate-opacity",
].join(" ");

function CheckboxIndicator() {
  return (
    <div className={checkboxIndicator}>
      <HugeiconsIcon className={checkboxIndicatorMinus} strokeWidth={4} icon={MinusSignIcon} />
      <HugeiconsIcon className={checkboxIndicatorCheck} strokeWidth={4} icon={Tick02Icon} />
    </div>
  );
}

type CheckboxLabelProps = TWVProps<typeof label> & PropsWithChildren;

function CheckboxLabel({ variants, children }: CheckboxLabelProps) {
  return (
    <span className={label(variants)}>
      {children}
    </span>
  );
}

Checkbox.Indicator = CheckboxIndicator;
Checkbox.Label = CheckboxLabel;
