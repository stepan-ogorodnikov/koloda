import { ChevronDoubleCloseIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAppHotkey, useHotkeysSettings } from "@koloda/react-base";
import { Button, button, dispatchKey, formLayoutSection, formLayoutSectionContent, Label, popover } from "@koloda/ui";
import type { TWVProps } from "@koloda/ui";
import { Popover } from "@koloda/ui";
import type { Key, KeyboardDelegate } from "@react-types/shared";
import type { HotkeyOptions } from "@tanstack/react-hotkeys";
import type { ComponentProps, ReactNode, RefObject } from "react";
import { useContext, useEffect, useMemo, useRef } from "react";
import {
  Autocomplete as ReactAriaAutocomplete,
  ListBox,
  ListBoxItem,
  ListLayout,
  Select as ReactAriaSelect,
  SelectStateContext,
  SelectValue as ReactAriaSelectValue,
  useFilter,
  Virtualizer,
} from "react-aria-components";
import type {
  ListBoxItemProps,
  ListBoxProps,
  PopoverProps,
  SelectProps as ReactAriaSelectProps,
  SelectValueProps as ReactAriaSelectValueProps,
} from "react-aria-components";
import type { SelectState as ReactAriaSelectState } from "react-stately";
import { tv } from "tailwind-variants";
import { SearchField } from "./search-field";

type SelectState = ReactAriaSelectState<unknown, "single" | "multiple"> | null;

type SelectOptions = {
  hasAutocomplete?: boolean;
  isVirtualized?: boolean;
};

export type SelectProps<T extends object> = Omit<SelectRootProps<T>, "children"> & SelectOptions & {
  buttonVariants?: SelectButtonProps["variants"];
  popoverVariants?: SelectPopoverProps["variants"];
  withChevron?: boolean;
  label?: ReactNode;
  icon?: ReactNode;
  items?: Iterable<T>;
  searchLabel?: string;
  searchPlaceholder?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
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
  hasAutocomplete,
  searchLabel,
  searchPlaceholder,
  isVirtualized,
  triggerRef,
  children,
  ...props
}: SelectProps<T>) {
  const { contains } = useFilter({ sensitivity: "base" });
  const selectStateRef = useRef<SelectState>(null);
  const keyboardDelegate = useMemo(() => createSelectKeyboardDelegate(selectStateRef), []);

  const listBox = (
    <Select.ListBox items={items} isVirtualized={isVirtualized}>
      {children}
    </Select.ListBox>
  );

  return (
    <Select.Root variants={variants} keyboardDelegate={keyboardDelegate} {...props}>
      <SelectStateBridge stateRef={selectStateRef} />
      {label && <Label variants={variants?.layout === "form" ? { layout: "form" } : {}}>{label}</Label>}
      <Select.Button
        variants={{ layout: variants?.layout, ...buttonVariants }}
        withChevron={withChevron}
        icon={icon}
        ref={triggerRef}
      />
      <Select.Popover variants={popoverVariants}>
        {!hasAutocomplete
          ? listBox
          : (
            <Select.Autocomplete filter={contains}>
              <Select.SearchField label={searchLabel} placeholder={searchPlaceholder} />
              {listBox}
            </Select.Autocomplete>
          )}
      </Select.Popover>
    </Select.Root>
  );
}

export const selectRoot = tv({
  base: "flex flex-col items-start select-none",
  variants: { layout: { form: formLayoutSection() } },
});

export type SelectRootProps<T extends object> = TWVProps<typeof selectRoot> & ReactAriaSelectProps<T> & {
  keyboardDelegate?: KeyboardDelegate;
};

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

export type SelectButtonProps = TWVProps<typeof selectButton> & ComponentProps<typeof Button> & {
  withChevron?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
};

function SelectButton({ variants, withChevron = true, icon, children, ref, ...props }: SelectButtonProps) {
  return (
    <Button ref={ref} className={selectButton(variants)} {...props}>
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
        <HugeiconsIcon
          className="size-4 min-w-4 rotate-90"
          strokeWidth={2}
          icon={ChevronDoubleCloseIcon}
          aria-hidden="true"
        />
      )}
    </Button>
  );
}

const selectValue = tv({
  base: "flex flex-row items-center gap-2 min-w-0 truncate",
  variants: { isPlaceholder: { true: "fg-disabled" } },
});

function SelectValue<T extends object>(props: ReactAriaSelectValueProps<T>) {
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

const selectPopover = tv({
  extend: popover,
  base: "flex-col items-stretch w-[var(--trigger-width)]",
});

type SelectPopoverProps = PopoverProps & TWVProps<typeof selectPopover>;

function SelectPopover({ variants, ...props }: SelectPopoverProps) {
  return <Popover className={selectPopover(variants)} {...props} />;
}

type SelectSearchFieldProps = {
  label?: string;
  placeholder?: string;
};

function SelectSearchField({ label, placeholder }: SelectSearchFieldProps) {
  return (
    <SearchField variants={{ class: "w-full" }} aria-label={label}>
      <SearchField.Group variants={{ style: "ghost", focusable: false }}>
        <SearchField.Icon />
        <SearchField.Input placeholder={placeholder} />
      </SearchField.Group>
    </SearchField>
  );
}

const selectListBox = tv({
  base: "py-1 rounded-lg max-h-96 overflow-y-auto overflow-x-hidden",
  variants: { isVirtualized: { true: "overflow-x-hidden", false: "" } },
});

type SelectListBoxProps<T extends object> = ListBoxProps<T> & SelectOptions;

function SelectListBox<T extends object>({ renderEmptyState, isVirtualized, ...props }: SelectListBoxProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  useSelectHotkeys(ref);

  const listBox = (
    <ListBox
      className={selectListBox({ isVirtualized })}
      renderEmptyState={renderEmptyState}
      ref={ref}
      {...props}
    />
  );

  return !isVirtualized ? listBox : (
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
  ],
});

function SelectListBoxItem({ children, ...props }: ListBoxItemProps) {
  return (
    <ListBoxItem className={selectListBoxItem()} {...props}>
      {(state) => (
        <>
          {typeof children === "function" ? children(state) : children}
          {state.isSelected && (
            <HugeiconsIcon
              className="size-4 min-w-4"
              strokeWidth={2.5}
              icon={Tick02Icon}
              aria-hidden="true"
            />
          )}
        </>
      )}
    </ListBoxItem>
  );
}

// Delegate for Select that:
// Preserves arrow navigation
function createSelectKeyboardDelegate(stateRef: RefObject<SelectState>): KeyboardDelegate {
  const getState = () => stateRef.current;

  return {
    getKeyAbove(key: Key) {
      const state = getState();
      return state?.collection.getKeyBefore(key) ?? null;
    },
    getKeyBelow(key: Key) {
      const state = getState();
      return state?.collection.getKeyAfter(key) ?? null;
    },
    getFirstKey() {
      const state = getState();
      return state?.collection.getFirstKey() ?? null;
    },
    getLastKey() {
      const state = getState();
      return state?.collection.getLastKey() ?? null;
    },
  };
}

// Store Select state from context to build a keyboard delegate
function SelectStateBridge({ stateRef }: { stateRef: RefObject<SelectState> }) {
  const state = useContext(SelectStateContext);

  useEffect(() => {
    stateRef.current = state;
  }, [state, stateRef]);

  return null;
}

function useSelectHotkeys(ref: RefObject<HTMLDivElement | null>) {
  const { ui } = useHotkeysSettings();
  const state = useContext(SelectStateContext);
  const options: HotkeyOptions = { target: ref.current, ignoreInputs: false, conflictBehavior: "allow" };
  useAppHotkey(ui.focusNext, () => dispatchKey(ref, "ArrowDown"), "", options);
  useAppHotkey(ui.focusPrev, () => dispatchKey(ref, "ArrowUp"), "", options);
  useAppHotkey(ui.close, () => dispatchKey(ref, "Escape"), "", options);

  // Fix for hotkeys with 'Alt' modifier breaking selecting with 'Space'
  useEffect(() => {
    if (!state?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT") return;

      if (e.key === " " || e.key === "Space") {
        const focusedKey = state?.selectionManager.focusedKey;
        if (focusedKey) {
          e.preventDefault();
          e.stopPropagation();
          state.selectionManager.select(focusedKey);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [state]);

  return null;
}

Select.Root = SelectRoot;
Select.Button = SelectButton;
Select.Value = SelectValue;
Select.Popover = SelectPopover;
Select.Autocomplete = ReactAriaAutocomplete;
Select.SearchField = SelectSearchField;
Select.ListBox = SelectListBox;
Select.ListBoxItem = SelectListBoxItem;
