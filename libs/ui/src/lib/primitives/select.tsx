import { Button, button, formLayoutSection, formLayoutSectionContent, Label } from "@koloda/ui";
import type { ButtonProps, TWVProps } from "@koloda/ui";
import { Popover } from "@koloda/ui";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
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
      form: formLayoutSection,
    },
  },
});

export type SelectRootProps<T extends object> = TWVProps<typeof selectRoot> & ReactAriaSelectProps<T>;

export function SelectRoot<T extends object>({ variants, ...props }: SelectRootProps<T>) {
  return <ReactAriaSelect className={selectRoot(variants)} {...props} />;
}

const selectButton = tv({
  extend: button,
  base: "justify-between w-full",
  variants: {
    layout: { form: [formLayoutSectionContent, "flex-row items-center max-w-60"] },
    size: { default: "h-10 p-2" },
  },
  defaultVariants: { style: "bordered" },
});

export type SelectButtonProps = TWVProps<typeof selectButton> & ButtonProps & {
  withChevron?: boolean;
  icon?: ReactNode;
};

function SelectButton({ variants, withChevron = true, icon, ...props }: SelectButtonProps) {
  return (
    <Button className={selectButton(variants)} {...props}>
      <ReactAriaSelectValue className="flex flex-row items-center gap-2">
        {(state) => (
          <>
            {icon}
            {state.defaultChildren}
          </>
        )}
      </ReactAriaSelectValue>
      {withChevron && (
        <div aria-hidden="true">
          <ChevronDown className="size-4" />
        </div>
      )}
    </Button>
  );
}

function SelectPopover(props: PopoverProps) {
  return <Popover variants={{ class: "flex-col items-stretch min-w-[var(--trigger-width)]" }} {...props} />;
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
    "outline-none rounded-lg cursor-default select-none",
    "cursor-default select-none focus:bg-picker-item-hover",
  ],
});

function SelectListBoxItem({ children, ...props }: ListBoxItemProps) {
  return (
    <ListBoxItem className={selectListBoxItem()} {...props}>
      {(state) => (
        <>
          {typeof children === "function" ? children(state) : children}
          {state.isSelected && <Check className="size-4" aria-hidden="true" />}
        </>
      )}
    </ListBoxItem>
  );
}

Select.Root = SelectRoot;
Select.Button = SelectButton;
Select.Popover = SelectPopover;
Select.ListBox = SelectListBox;
Select.ListBoxItem = SelectListBoxItem;
