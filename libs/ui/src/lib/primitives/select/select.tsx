import { Label } from "@koloda/ui";
import type { LabelProps } from "@koloda/ui";
import type { ReactNode, RefObject } from "react";
import { useMemo, useRef } from "react";
import {
  Autocomplete as ReactAriaAutocomplete,
  Collection as ReactAriaCollection,
  useFilter,
} from "react-aria-components";
import { createSelectKeyboardDelegate, isIterableEmpty, SelectStateBridge } from "./select-behavior";
import type { SelectState } from "./select-behavior";
import { SelectButton } from "./select-button";
import type { SelectButtonProps } from "./select-button";
import { SelectContent } from "./select-content";
import { SelectHeader } from "./select-header";
import { SelectListBox, SelectListBoxItem, SelectListBoxSection, type SelectListBoxProps } from "./select-list-box";
import { SelectPopover } from "./select-popover";
import type { SelectPopoverProps } from "./select-popover";
import { SelectRoot } from "./select-root";
import type { SelectRootProps } from "./select-root";
import { SelectSearchField } from "./select-search-field";
import { SelectValue } from "./select-value";

type SelectOptions = {
  hasAutocomplete?: boolean;
  isVirtualized?: boolean;
};

export type SelectProps<T extends object> = Omit<SelectRootProps<T>, "children"> &
  SelectOptions & {
    labelVariants?: LabelProps["variants"];
    buttonVariants?: SelectButtonProps["variants"];
    popoverVariants?: SelectPopoverProps["variants"];
    listboxVariants?: SelectListBoxProps<T>["variants"];
    withChevron?: boolean;
    label?: ReactNode;
    placeholder?: string;
    icon?: ReactNode;
    items?: Iterable<T>;
    searchLabel?: string;
    searchPlaceholder?: string;
    triggerRef?: RefObject<HTMLButtonElement | null>;
    renderEmptyState?: (props: { isFocused: boolean }) => ReactNode;
    onChange: (key: string | number | null) => void;
    children: ReactNode | ((item: T) => ReactNode);
  };

export function Select<T extends object>({
  variants,
  labelVariants,
  buttonVariants,
  popoverVariants,
  listboxVariants,
  withChevron,
  label,
  icon,
  items,
  hasAutocomplete,
  searchLabel,
  searchPlaceholder,
  isVirtualized,
  triggerRef,
  renderEmptyState,
  children,
  ...props
}: SelectProps<T>) {
  const { contains } = useFilter({ sensitivity: "base" });
  const selectStateRef = useRef<SelectState>(null);
  const keyboardDelegate = useMemo(() => createSelectKeyboardDelegate(selectStateRef), []);
  const showEmptyContent = isIterableEmpty(items) && renderEmptyState != null;

  const listBox = (
    <Select.ListBox items={items} isVirtualized={isVirtualized} variants={listboxVariants}>
      {children}
    </Select.ListBox>
  );

  return (
    <Select.Root
      variants={variants}
      keyboardDelegate={keyboardDelegate}
      {...props}
      allowsEmptyCollection={props.allowsEmptyCollection ?? showEmptyContent}
    >
      <SelectStateBridge stateRef={selectStateRef} />
      {label && (
        <Label variants={labelVariants || (variants?.layout === "form" ? { layout: "form" } : undefined)}>
          {label}
        </Label>
      )}
      <Select.Button
        variants={{ layout: variants?.layout, ...buttonVariants }}
        withChevron={withChevron}
        icon={icon}
        ref={triggerRef}
      />
      <Select.Popover variants={popoverVariants}>
        <SelectContent
          showEmptyContent={showEmptyContent}
          hasAutocomplete={hasAutocomplete}
          listboxVariants={listboxVariants}
          renderEmptyState={renderEmptyState}
          searchLabel={searchLabel}
          searchPlaceholder={searchPlaceholder}
          filter={contains}
          listBox={listBox}
        />
      </Select.Popover>
    </Select.Root>
  );
}

Select.Root = SelectRoot;
Select.Button = SelectButton;
Select.Value = SelectValue;
Select.Popover = SelectPopover;
Select.Autocomplete = ReactAriaAutocomplete;
Select.SearchField = SelectSearchField;
Select.ListBox = SelectListBox;
Select.ListBoxItem = SelectListBoxItem;
Select.ListBoxSection = SelectListBoxSection;
Select.Header = SelectHeader;
Select.Collection = ReactAriaCollection;
