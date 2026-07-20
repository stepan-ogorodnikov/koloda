import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import { useRef } from "react";
import { ListBox, ListBoxItem, ListBoxSection, ListLayout, Virtualizer } from "react-aria-components";
import type { ListBoxItemProps, ListBoxProps, ListBoxSectionProps } from "react-aria-components";
import { tv } from "tailwind-variants";
import { useSelectHotkeys } from "./select-behavior";

export const selectListBox = tv({
  base: "py-1 rounded-lg max-h-96 overflow-y-auto overflow-x-hidden",
  variants: { isVirtualized: { true: "overflow-x-hidden" } },
});

export type SelectListBoxProps<T extends object> = ListBoxProps<T> &
  TWVProps<typeof selectListBox> & {
    hasAutocomplete?: boolean;
    isVirtualized?: boolean;
  };

export function SelectListBox<T extends object>({
  renderEmptyState,
  isVirtualized,
  variants,
  ...props
}: SelectListBoxProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  useSelectHotkeys(ref);

  const listBox = (
    <ListBox
      className={selectListBox({ isVirtualized, ...variants })}
      renderEmptyState={renderEmptyState}
      ref={ref}
      {...props}
    />
  );

  return !isVirtualized ? (
    listBox
  ) : (
    <Virtualizer layout={ListLayout} layoutOptions={{ padding: 4 }}>
      {listBox}
    </Virtualizer>
  );
}

const selectListBoxItem = tv({
  base: [
    "flex flex-row items-center justify-between gap-2 mx-1 py-2 px-2",
    "outline-none rounded-lg cursor-default select-none truncate",
    "cursor-default select-none focus:bg-picker-item-hover",
    "disabled:fg-level-3 disabled:focus:bg-transparent",
  ],
});

export function SelectListBoxItem({ children, ...props }: ListBoxItemProps) {
  return (
    <ListBoxItem className={selectListBoxItem()} {...props}>
      {(state) => (
        <>
          {typeof children === "function" ? children(state) : children}
          {state.isSelected && (
            <HugeiconsIcon className="size-4 min-w-4" strokeWidth={2.5} icon={CheckIcon} aria-hidden="true" />
          )}
        </>
      )}
    </ListBoxItem>
  );
}

export function SelectListBoxSection<T extends object>(props: ListBoxSectionProps<T>) {
  return <ListBoxSection className="flex flex-col outline-none" {...props} />;
}
