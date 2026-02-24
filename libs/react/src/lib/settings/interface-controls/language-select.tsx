import { langAtom, queriesAtom } from "@koloda/react";
import { LANGUAGES } from "@koloda/srs";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { Languages } from "lucide-react";

type LanguageSelectProps = Partial<SelectProps<typeof LANGUAGES[number]>> & {
  withIcon?: boolean;
  isPersisted?: boolean;
};

export function LanguageSelect(
  { label, withIcon = true, isPersisted = true, ...props }: LanguageSelectProps,
) {
  const { _, i18n } = useLingui();
  const setLang = useSetAtom(langAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation({ ...patchSettingsMutation() });

  return (
    <Select
      label={label}
      aria-label={!label ? _(msg`language-select.label`) : undefined}
      icon={withIcon ? <Languages className="size-5" /> : undefined}
      items={LANGUAGES}
      value={i18n.locale}
      onChange={(key) => {
        if (key) {
          setLang(key.toString());
          if (isPersisted) mutate({ name: "interface", content: { language: key.toString() } });
        }
      }}
      {...props}
    >
      {LANGUAGES.map(({ id, value }) => (
        <Select.ListBoxItem id={id} textValue={value} key={id}>
          {value}
        </Select.ListBoxItem>
      ))}
    </Select>
  );
}
