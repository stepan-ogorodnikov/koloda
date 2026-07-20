import { useContext, useEffect, useRef } from "react";
import { SelectStateContext } from "react-aria-components";
import { SearchField } from "../search-field";

export type SelectSearchFieldProps = {
  label?: string;
  placeholder?: string;
};

export function SelectSearchField({ label, placeholder }: SelectSearchFieldProps) {
  const state = useContext(SelectStateContext);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.isOpen && inputRef.current) inputRef.current.focus();
  }, [state?.isOpen]);

  return (
    <SearchField variants={{ class: "w-full" }} aria-label={label}>
      <SearchField.Group variants={{ style: "ghost", focusable: false, class: "mt-1 -mb-1" }}>
        <SearchField.Icon />
        <SearchField.Input placeholder={placeholder} ref={inputRef} />
      </SearchField.Group>
    </SearchField>
  );
}
