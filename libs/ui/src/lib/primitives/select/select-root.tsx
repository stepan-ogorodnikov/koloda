import { formLayoutSection } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import type { KeyboardDelegate } from "@react-types/shared";
import { Select as ReactAriaSelect } from "react-aria-components";
import type { SelectProps as ReactAriaSelectProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const selectRoot = tv({
  base: "flex flex-col items-start select-none",
  variants: { layout: { form: formLayoutSection() } },
});

export type SelectRootProps<T extends object> = TWVProps<typeof selectRoot> &
  ReactAriaSelectProps<T> & {
    keyboardDelegate?: KeyboardDelegate;
  };

export function SelectRoot<T extends object>({ variants, ...props }: SelectRootProps<T>) {
  return <ReactAriaSelect className={selectRoot(variants)} {...props} />;
}
