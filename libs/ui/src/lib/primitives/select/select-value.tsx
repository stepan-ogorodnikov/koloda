import { SelectValue as ReactAriaSelectValue } from "react-aria-components";
import type { SelectValueProps as ReactAriaSelectValueProps } from "react-aria-components";
import { tv } from "tailwind-variants";

const selectValue = tv({
  base: "flex flex-row items-center gap-2 min-w-0 truncate",
  variants: { isPlaceholder: { true: "fg-disabled" } },
});

export function SelectValue<T extends object>(props: ReactAriaSelectValueProps<T>) {
  return (
    <ReactAriaSelectValue className="min-w-0" {...props}>
      {(state) => (
        <span className={selectValue({ isPlaceholder: state.isPlaceholder })}>
          {typeof props.children === "function" ? props.children(state) : state.defaultChildren}
        </span>
      )}
    </ReactAriaSelectValue>
  );
}
