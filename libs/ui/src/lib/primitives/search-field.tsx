import { Button, FieldGroup, fieldGroup, TextField } from "@koloda/ui";
import type { ButtonProps, FieldGroupProps, TextFieldInputProps, TWVProps } from "@koloda/ui";
import { Search as SearchIcon, X } from "lucide-react";
import { SearchField as ReactAriaSearchField } from "react-aria-components";
import type { SearchFieldProps as ReactAriaSearchFieldProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const searchField = tv({ base: "flex" });

export type SearchFieldProps = ReactAriaSearchFieldProps & TWVProps<typeof searchField>;

export function SearchField({ variants, ...props }: SearchFieldProps) {
  return <ReactAriaSearchField className={searchField(variants)} {...props} />;
}

export const searchFieldGroup = tv({
  extend: fieldGroup,
  base: "px-1",
  defaultVariants: {
    style: "input",
    size: "default",
    focusable: true,
  },
});

export type SearchFieldGroupProps = TWVProps<typeof searchFieldGroup> & FieldGroupProps;

export function SearchFieldGroup({ variants, ...props }: SearchFieldGroupProps) {
  return <FieldGroup className={searchFieldGroup(variants)} {...props} />;
}

const searchFieldIcon = "size-4 min-w-4 ml-1 fg-inactive pointer-events-none";

function SearchFieldIcon() {
  return <SearchIcon className={searchFieldIcon} />;
}

export type SearchFieldInputProps = TextFieldInputProps;

export function SearchFieldInput(props: SearchFieldInputProps) {
  return <TextField.Input variants={{ style: "inline", class: "px-1 no-focus-ring" }} {...props} />;
}

export type SearchFieldClearButtonProps = ButtonProps & {
  isHidden: boolean;
};

function SearchFieldClearButton({ isHidden, ...props }: SearchFieldClearButtonProps) {
  const cn = (isHidden ? "opacity-0 " : "") + "animate-opacity";

  return (
    <Button variants={{ style: "ghost", size: "miniIcon", class: cn }} {...props}>
      <X className="size-4 min-w-4" />
    </Button>
  );
}

SearchField.Group = SearchFieldGroup;
SearchField.Icon = SearchFieldIcon;
SearchField.Input = SearchFieldInput;
SearchField.ClearButton = SearchFieldClearButton;
