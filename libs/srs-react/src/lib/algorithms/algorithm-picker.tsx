import { defaultAlgorithmAtom } from "@koloda/core-react";
import { queriesAtom } from "@koloda/core-react";
import type { Algorithm } from "@koloda/srs";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect } from "react";

type AlgorithmPickerProps = Omit<SelectProps<Algorithm>, "value" | "onChange" | "items" | "children"> & {
  value: Algorithm["id"] | null;
  onChange: (key: Algorithm["id"]) => void;
};

export function AlgorithmPicker({ label, value, onChange, ...props }: AlgorithmPickerProps) {
  const { _ } = useLingui();
  const { getAlgorithmsQuery } = useAtomValue(queriesAtom);
  const defaultAlgorithm = useAtomValue(defaultAlgorithmAtom);
  const { data } = useQuery(getAlgorithmsQuery());

  useEffect(() => {
    if (!value) onChange(defaultAlgorithm);
  }, [value, onChange, defaultAlgorithm]);

  if (!data) return null;

  return (
    <Select
      label={label || _(msg`algorithm-picker.label`)}
      items={data}
      value={value || defaultAlgorithm}
      onChange={(key) => {
        if (typeof key === "string") onChange(key);
      }}
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
