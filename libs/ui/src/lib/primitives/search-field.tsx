import { Button, FieldGroup, fieldGroup } from "@koloda/ui";
import type { ButtonProps, FieldGroupProps, TWVProps } from "@koloda/ui";
import { Search as SearchIcon, X } from "lucide-react";
import { Input, SearchField as ReactAriaSearchField } from "react-aria-components";
import type { InputProps, SearchFieldProps as ReactAriaSearchFieldProps } from "react-aria-components";
import { tv } from "tailwind-variants";

export const searchField = tv({ base: "flex" });

export type SearchFieldProps = ReactAriaSearchFieldProps & TWVProps<typeof searchField>;

export function SearchField({ variants, ...props }: SearchFieldProps) {
  return <ReactAriaSearchField className={searchField(variants)} {...props} />;
}

export const searchFieldGroup = tv({
  extend: fieldGroup,
  base: "w-full px-2",
  defaultVariants: {
    style: "input",
    size: "default",
    focusable: true,
  },
});

export type SearchFieldGroupProps = TWVProps<typeof searchFieldGroup> & FieldGroupProps;

function SearchFieldGroup({ variants, ...props }: SearchFieldGroupProps) {
  return <FieldGroup className={searchFieldGroup(variants)} role="group" {...props} />;
}

export const searchFieldInput = tv({
  base: "w-full min-w-0 px-2 border-0 bg-transparent outline-none",
});

export type SearchFieldInputProps = InputProps & TWVProps<typeof searchFieldInput>;

export function SearchFieldInput({ variants, ...props }: SearchFieldInputProps) {
  return <Input className={searchFieldInput(variants)} {...props} />;
}

const searchFieldIcon = "size-4 min-w-4 fg-inactive pointer-events-none";

function SearchFieldIcon() {
  return <SearchIcon className={searchFieldIcon} />;
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
