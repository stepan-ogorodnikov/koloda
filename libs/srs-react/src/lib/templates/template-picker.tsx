import { queriesAtom } from "@koloda/core-react";
import type { Template } from "@koloda/srs";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

type TemplatePickerProps = Omit<SelectProps<Template>, "value" | "onChange" | "items" | "children"> & {
  value: Template["id"];
  onChange: (key: Template["id"]) => void;
};

export function TemplatePicker({ value, onChange, ...props }: TemplatePickerProps) {
  const { _ } = useLingui();
  const { getTemplatesQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery(getTemplatesQuery());

  if (!data) return null;

  return (
    <Select
      label={_(msg`template-picker.label`)}
      items={data}
      value={value}
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
