import { algorithmsQueryKeys, defaultAlgorithmAtom, queriesAtom } from "@koloda/react";
import type { Algorithm } from "@koloda/srs";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect } from "react";

type AlgorithmPickerProps = Omit<SelectProps<Algorithm>, "value" | "onChange" | "items" | "children"> & {
  isNullable?: boolean;
  value: number | null;
  onChange: (key: number) => void;
};

export function AlgorithmPicker({ label, isNullable, value, onChange, ...props }: AlgorithmPickerProps) {
  const { _ } = useLingui();
  const { getAlgorithmsQuery } = useAtomValue(queriesAtom);
  const defaultAlgorithm = useAtomValue(defaultAlgorithmAtom);
  const { data } = useQuery({ queryKey: algorithmsQueryKeys.all(), ...getAlgorithmsQuery() });

  useEffect(() => {
    if (!isNullable && !value) onChange(defaultAlgorithm);
  }, [isNullable, value, onChange, defaultAlgorithm]);

  if (!isNullable && !data) return null;

  return (
    <Select
      label={label || _(msg`algorithm-picker.label`)}
      items={data}
      value={value || defaultAlgorithm}
      onChange={(i) => onChange(Number(i))}
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
