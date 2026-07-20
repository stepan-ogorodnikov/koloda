import type { ReactNode } from "react";
import { Autocomplete as ReactAriaAutocomplete } from "react-aria-components";
import { SelectEmptyContent } from "./select-empty-content";
import type { SelectListBoxProps } from "./select-list-box";
import { SelectSearchField } from "./select-search-field";

export type SelectContentProps<T extends object> = {
  showEmptyContent: boolean;
  hasAutocomplete?: boolean;
  listboxVariants?: SelectListBoxProps<T>["variants"];
  renderEmptyState?: (props: { isFocused: boolean }) => ReactNode;
  searchLabel?: string;
  searchPlaceholder?: string;
  filter: (textValue: string, inputValue: string) => boolean;
  listBox: ReactNode;
};

export function SelectContent<T extends object>({
  showEmptyContent,
  hasAutocomplete,
  listboxVariants,
  renderEmptyState,
  searchLabel,
  searchPlaceholder,
  filter,
  listBox,
}: SelectContentProps<T>) {
  if (showEmptyContent) {
    return (
      <SelectEmptyContent variants={listboxVariants}>{renderEmptyState!({ isFocused: false })}</SelectEmptyContent>
    );
  }

  if (!hasAutocomplete) return listBox;

  return (
    <ReactAriaAutocomplete filter={filter}>
      <SelectSearchField label={searchLabel} placeholder={searchPlaceholder} />
      {listBox}
    </ReactAriaAutocomplete>
  );
}
