import { Button, button, formLayoutSection, formLayoutSectionContent, Label, popover } from "@koloda/ui";
import type { ButtonProps, TWVProps } from "@koloda/ui";
import { Popover } from "@koloda/ui";
import { Check, ChevronDown } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";
import {
  ListBox,
  ListBoxItem,
  Select as ReactAriaSelect,
  SelectValue as ReactAriaSelectValue,
} from "react-aria-components";
import type {
  ListBoxItemProps,
  ListBoxProps,
  PopoverProps,
  SelectProps as ReactAriaSelectProps,
  SelectValueProps as ReactAriaSelectValueProps,
} from "react-aria-components";
import { tv } from "tailwind-variants";

export type SelectProps<T extends object> = Omit<SelectRootProps<T>, "children"> & {
  withChevron?: boolean;
  label?: ReactNode;
  icon?: ReactNode;
  items?: Iterable<T>;
  onSelectionChange: (key: string | number | null) => void;
  children: ReactNode | ((item: T) => ReactNode);
};

export function Select<T extends object>(
  { variants, withChevron, label, icon, items, children, ...props }: SelectProps<T>,
) {
  return (
    <Select.Root variants={variants} {...props}>
      {label && <Label variants={variants?.layout === "form" ? { layout: "form" } : {}}>{label}</Label>}
      <Select.Button variants={variants} withChevron={withChevron} icon={icon} />
      <Select.Popover>
        <Select.ListBox items={items}>
          {children}
        </Select.ListBox>
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
  base: "justify-between w-full min-w-0",
  variants: {
    layout: { form: [formLayoutSectionContent, "flex-row items-center max-w-60"] },
    size: { default: "h-10 p-2" },
  },
  defaultVariants: { style: "bordered" },
});

export type SelectButtonProps = TWVProps<typeof selectButton> & ButtonProps & PropsWithChildren & {
  withChevron?: boolean;
  icon?: ReactNode;
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

function SelectValue<T extends object>(props: ReactAriaSelectValueProps<T>) {
  return <ReactAriaSelectValue className="flex flex-row items-center gap-2 truncate" {...props} />;
}

const selectPopover = tv({
  extend: popover,
  base: "flex-col items-stretch w-[var(--trigger-width)]",
});

type SelectPopoverProps = PopoverProps & TWVProps<typeof selectPopover>;

function SelectPopover({ variants, ...props }: SelectPopoverProps) {
  return <Popover className={selectPopover(variants)} {...props} />;
}

const selectListBox = tv({ base: "py-1 rounded-lg" });

function SelectListBox<T extends object>({
  children,
  ...props
}: ListBoxProps<T>) {
  return (
    <ListBox className={selectListBox()} {...props}>
      {children}
    </ListBox>
  );
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
Select.ListBox = SelectListBox;
Select.ListBoxItem = SelectListBoxItem;
