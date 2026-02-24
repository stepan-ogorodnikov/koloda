import { Button, button, formLayoutSection, formLayoutSectionContent, Label, popover } from "@koloda/ui";
import type { ButtonProps, TWVProps } from "@koloda/ui";
import { Popover } from "@koloda/ui";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import {
  Autocomplete as ReactAriaAutocomplete,
  ListBox,
  ListBoxItem,
  ListLayout,
  Select as ReactAriaSelect,
  SelectValue as ReactAriaSelectValue,
  useFilter,
  Virtualizer,
} from "react-aria-components";
import type {
  AutocompleteProps as ReactAriaAutocompleteProps,
  ListBoxItemProps,
  ListBoxProps,
  PopoverProps,
  SelectProps as ReactAriaSelectProps,
  SelectValueProps as ReactAriaSelectValueProps,
} from "react-aria-components";
import { tv } from "tailwind-variants";
import { SearchField } from "./search-field";

export type SelectProps<T extends object> = Omit<SelectRootProps<T>, "children"> & {
  buttonVariants?: SelectButtonProps["variants"];
  popoverVariants?: SelectPopoverProps["variants"];
  withChevron?: boolean;
  label?: ReactNode;
  icon?: ReactNode;
  items?: Iterable<T>;
  autocomplete?: boolean;
  autocompleteFilter?: ReactAriaAutocompleteProps<T>["filter"];
  searchLabel?: string;
  searchPlaceholder?: string;
  virtualized?: boolean;
  onChange: (key: string | number | null) => void;
  children: ReactNode | ((item: T) => ReactNode);
};

export function Select<T extends object>({
  variants,
  buttonVariants,
  popoverVariants,
  withChevron,
  label,
  icon,
  items,
  autocomplete,
  autocompleteFilter,
  searchLabel,
  searchPlaceholder,
  virtualized,
  children,
  ...props
}: SelectProps<T>) {
  const { contains } = useFilter({ sensitivity: "base" });

  return (
    <Select.Root variants={variants} {...props}>
      {label && <Label variants={variants?.layout === "form" ? { layout: "form" } : {}}>{label}</Label>}
      <Select.Button variants={{ layout: variants?.layout, ...buttonVariants }} withChevron={withChevron} icon={icon} />
      <Select.Popover variants={popoverVariants}>
        {autocomplete
          ? (
            <Select.Autocomplete filter={autocompleteFilter ?? contains}>
              <SearchField variants={{ class: "w-full" }} aria-label={searchLabel} autoFocus>
                <SearchField.Group variants={{ style: "ghost" }}>
                  <SearchField.Icon />
                  <SearchField.Input placeholder={searchPlaceholder} />
                </SearchField.Group>
              </SearchField>
              <Select.ListBox items={items} virtualized={virtualized}>
                {children}
              </Select.ListBox>
            </Select.Autocomplete>
          )
          : (
            <Select.ListBox items={items} virtualized={virtualized}>
              {children}
            </Select.ListBox>
          )}
      </Select.Popover>
    </Select.Root>
  );
}

export const selectRoot = tv({
  base: "flex flex-col items-start select-none",
  variants: {
    layout: {
      form: formLayoutSection(),
    },
  },
});

export type SelectRootProps<T extends object> = TWVProps<typeof selectRoot> & ReactAriaSelectProps<T>;

export function SelectRoot<T extends object>({ variants, ...props }: SelectRootProps<T>) {
  return <ReactAriaSelect className={selectRoot(variants)} {...props} />;
}

const selectButton = tv({
  extend: button,
  base: "justify-between w-full min-w-0 font-normal",
  variants: {
    layout: { form: [formLayoutSectionContent, "flex-row items-center max-w-60"] },
    size: { default: "h-10 p-2" },
  },
  defaultVariants: { style: "bordered" },
});

export type SelectButtonProps = TWVProps<typeof selectButton> & Omit<ButtonProps, "children"> & {
  withChevron?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
};

function SelectButton({ variants, withChevron = true, icon, children, ...props }: SelectButtonProps) {
  return (
    <Button className={selectButton(variants)} {...props}>
      {children || (
        <SelectValue>
          {(state) => (
            <>
              {icon}
              {state.defaultChildren}
            </>
          )}
        </SelectValue>
      )}
      {withChevron && (
        <div aria-hidden="true">
          <ChevronDown className="size-4 min-w-4" />
        </div>
      )}
    </Button>
  );
}

const selectValue = tv({
  base: "flex flex-row items-center gap-2 truncate",
  variants: {
    isPlaceholder: {
      true: "fg-disabled",
    },
  },
});

function SelectValue<T extends object>(props: ReactAriaSelectValueProps<T>) {
  return (
    <ReactAriaSelectValue {...props}>
      {(state) => (
        <span className={selectValue({ isPlaceholder: state.isPlaceholder })}>
          {typeof props.children === "function" ? props.children(state) : state.defaultChildren}
        </span>
      )}
    </ReactAriaSelectValue>
  );
}

const selectPopover = tv({
  extend: popover,
  base: "flex-col items-stretch w-[var(--trigger-width)]",
});

type SelectPopoverProps = PopoverProps & TWVProps<typeof selectPopover>;

function SelectPopover({ variants, ...props }: SelectPopoverProps) {
  return <Popover className={selectPopover(variants)} {...props} />;
}

const selectListBox = tv({ base: "py-1 rounded-lg max-h-96 overflow-y-auto overflow-x-hidden" });

type SelectListBoxProps<T extends object> = ListBoxProps<T> & { virtualized?: boolean };

function SelectListBox<T extends object>({
  children,
  renderEmptyState,
  virtualized,
  ...props
}: SelectListBoxProps<T>) {
  if (virtualized) {
    return (
      <Virtualizer layout={ListLayout} layoutOptions={{ padding: 4 }}>
        <ListBox
          className={selectListBox({ class: "overflow-x-hidden" })}
          renderEmptyState={renderEmptyState}
          {...props}
        >
          {children}
        </ListBox>
      </Virtualizer>
    );
  }

  return (
    <ListBox className={selectListBox()} renderEmptyState={renderEmptyState} {...props}>
      {children}
    </ListBox>
  );
}

export type SelectAutocompleteProps<T extends object> = ReactAriaAutocompleteProps<T>;

function SelectAutocomplete<T extends object>(props: SelectAutocompleteProps<T>) {
  return <ReactAriaAutocomplete {...props} />;
}

const selectListBoxItem = tv({
  base: [
    "flex flex-row items-center justify-between gap-2 mx-1 py-2 px-2",
    "outline-none rounded-lg cursor-default select-none truncate",
    "cursor-default select-none focus:bg-picker-item-hover",
  ],
});

function SelectListBoxItem({ children, ...props }: ListBoxItemProps) {
  return (
    <ListBoxItem className={selectListBoxItem()} {...props}>
      {(state) => (
        <>
          {typeof children === "function" ? children(state) : children}
          {state.isSelected && <Check className="size-4 min-w-4" aria-hidden="true" />}
        </>
      )}
    </ListBoxItem>
  );
}

Select.Root = SelectRoot;
Select.Button = SelectButton;
Select.Value = SelectValue;
Select.Popover = SelectPopover;
Select.Autocomplete = SelectAutocomplete;
Select.ListBox = SelectListBox;
Select.ListBoxItem = SelectListBoxItem;
