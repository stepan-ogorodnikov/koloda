import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Deck } from "@koloda/srs";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect } from "react";

type DeckPickerProps = Omit<SelectProps<Deck>, "value" | "onChange" | "items" | "children"> & {
  isNullable?: boolean;
  value: number | null;
  onChange: (key: number) => void;
};

export function DeckPicker({ variants, label, isNullable, value, onChange, ...props }: DeckPickerProps) {
  const { _ } = useLingui();
  const { getDecksQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: queryKeys.decks.all(), ...getDecksQuery() });

  useEffect(() => {
    if (!isNullable && !value && data?.length) onChange(data[0].id);
  }, [isNullable, value, onChange, data]);

  if (!isNullable && !data) return null;

  return (
    <Select
      variants={variants}
      label={label || _(msg`deck-picker.label`)}
      placeholder={_(msg`deck-picker.placeholder`)}
      items={data}
      value={value}
      onChange={(i) => onChange(Number(i))}
      hasAutocomplete
      searchPlaceholder={_(msg`deck-picker.search`)}
      {...props}
    >
      {({ id, title }) => (
        <Select.ListBoxItem textValue={title} key={id}>
          {title}
        </Select.ListBoxItem>
      )}
    </Select>
  );
}
