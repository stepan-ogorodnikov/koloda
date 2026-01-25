import { defaultTemplateAtom, queriesAtom, templatesQueryKeys } from "@koloda/react";
import type { Template } from "@koloda/srs";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect } from "react";

type TemplatePickerProps = Omit<SelectProps<Template>, "selectedKey" | "onSelectionChange" | "items" | "children"> & {
  value: number;
  onChange: (key: number) => void;
};

export function TemplatePicker({ value, onChange, ...props }: TemplatePickerProps) {
  const { _ } = useLingui();
  const { getTemplatesQuery } = useAtomValue(queriesAtom);
  const defaultTemplate = useAtomValue(defaultTemplateAtom);
  const { data } = useQuery({ queryKey: templatesQueryKeys.all(), ...getTemplatesQuery() });

  useEffect(() => {
    if (!value) onChange(defaultTemplate);
  }, [value, onChange, defaultTemplate]);

  if (!data) return null;

  return (
    <Select
      label={_(msg`template-picker.label`)}
      items={data}
      value={value || defaultTemplate}
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
