import { useHotkeysSettings } from "@koloda/react-base";
import {
  Button,
  button,
  dispatchArrowKey,
  formLayoutSection,
  formLayoutSectionContent,
  isComposingEvent,
  isPrintableKey,
  Label,
  matchesAnyHotkey,
  popover,
} from "@koloda/ui";
import type { ButtonProps, TWVProps } from "@koloda/ui";
import { Popover } from "@koloda/ui";
import type { Key, KeyboardDelegate } from "@react-types/shared";
import { Check, ChevronDown } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  AutocompleteProps as ReactAriaAutocompleteProps,
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

export type SelectProps<T extends object> = Omit<SelectRootProps<T>, "children"> & {
  buttonVariants?: SelectButtonProps["variants"];
  popoverVariants?: SelectPopoverProps["variants"];
  withChevron?: boolean;
  label?: ReactNode;
  icon?: ReactNode;
  disableTypeahead?: boolean;
  items?: Iterable<T>;
  autocomplete?: boolean;
  autocompleteFilter?: ReactAriaAutocompleteProps<T>["filter"];
  searchLabel?: string;
  searchPlaceholder?: string;
  isVirtualized?: boolean;
  onKeyDownCapture?: (e: ReactKeyboardEvent<HTMLElement>) => void;
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
  disableTypeahead,
  items,
  autocomplete,
  autocompleteFilter,
  searchLabel,
  searchPlaceholder,
  isVirtualized,
  children,
  ...props
}: SelectProps<T>) {
  const { contains } = useFilter({ sensitivity: "base" });
  const [isOpen, setIsOpen] = useState(false);
  const selectStateRef = useRef<SelectState>(null);
  const keyboardDelegate = useMemo(() => createSelectKeyboardDelegate(selectStateRef), []);

  return (
    <Select.Root
      variants={variants}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      keyboardDelegate={keyboardDelegate}
      {...props}
    >
      <SelectStateBridge stateRef={selectStateRef} />
      {label && <Label variants={variants?.layout === "form" ? { layout: "form" } : {}}>{label}</Label>}
      <Select.Button
        variants={{ layout: variants?.layout, ...buttonVariants }}
        withChevron={withChevron}
        icon={icon}
      />
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
              <Select.ListBox
                items={items}
                isVirtualized={isVirtualized}
                isOpen={isOpen}
                onOpenChange={setIsOpen}
                disableTypeahead={disableTypeahead}
              >
                {children}
              </Select.ListBox>
            </Select.Autocomplete>
          )
          : (
            <Select.ListBox
              items={items}
              isVirtualized={isVirtualized}
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              disableTypeahead={disableTypeahead}
            >
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

const selectListBox = tv({
  base: "py-1 rounded-lg max-h-96 overflow-y-auto overflow-x-hidden",
  variants: { isVirtualized: { true: "overflow-x-hidden", false: "" } },
});

type SelectListBoxProps<T extends object> = ListBoxProps<T> & {
  isVirtualized?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  disableTypeahead?: boolean;
};

function SelectListBox<T extends object>(
  { children, renderEmptyState, isVirtualized, isOpen, onOpenChange, disableTypeahead, ...props }: SelectListBoxProps<
    T
  >,
) {
  const { ui } = useHotkeysSettings();
  const listBoxRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || isComposingEvent(e) || !isOpen) return;

    // Optionally disable typeahead when the listbox is open.
    if (disableTypeahead && isPrintableKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Navigate next (move down) hotkey
    if (ui.focusNext.length > 0 && matchesAnyHotkey(e.nativeEvent, ui.focusNext)) {
      if (e.key !== "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        dispatchArrowKey(listBoxRef, "ArrowDown");
      }
      return;
    }

    // Navigate previous (move up) hotkey
    if (ui.focusPrev.length > 0 && matchesAnyHotkey(e.nativeEvent, ui.focusPrev)) {
      if (e.key !== "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        dispatchArrowKey(listBoxRef, "ArrowUp");
      }
      return;
    }

    // Close hotkey
    if (isOpen && ui.close.length > 0 && matchesAnyHotkey(e.nativeEvent, ui.close)) {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange?.(false);
      return;
    }
  }, [disableTypeahead, ui, isOpen, onOpenChange]);

  const listBox = (
    <ListBox
      className={selectListBox({ isVirtualized })}
      renderEmptyState={renderEmptyState}
      ref={listBoxRef}
      {...props}
    >
      {children}
    </ListBox>
  );

  if (isVirtualized) {
    return (
      <div onKeyDownCapture={onKeyDown} style={{ display: "contents" }}>
        <Virtualizer layout={ListLayout} layoutOptions={{ padding: 4 }}>
          {listBox}
        </Virtualizer>
      </div>
    );
  }

  return (
    <div onKeyDownCapture={onKeyDown} style={{ display: "contents" }}>
      {listBox}
    </div>
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

// Delegate for Select that:
// Preserves arrow navigation
// Omits getKeyForSearch, preventing RAC typeahead on the trigger when closed
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

Select.Root = SelectRoot;
Select.Button = SelectButton;
Select.Value = SelectValue;
Select.Popover = SelectPopover;
Select.Autocomplete = SelectAutocomplete;
Select.ListBox = SelectListBox;
Select.ListBoxItem = SelectListBoxItem;
