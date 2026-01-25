import { langAtom, queriesAtom } from "@koloda/react";
import { LANGUAGES } from "@koloda/srs";
import { Select } from "@koloda/ui";
import type { SelectButtonProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { Languages } from "lucide-react";
import type { ReactNode } from "react";

type LanguageSelectProps = {
  variants?: SelectButtonProps["variants"];
  label?: ReactNode;
  withChevron?: boolean;
  withIcon?: boolean;
  isPersisted?: boolean;
};

export function LanguageSelect(
  { variants, label, withChevron, withIcon = true, isPersisted = true }: LanguageSelectProps,
) {
  const { _, i18n } = useLingui();
  const setLang = useSetAtom(langAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation({ ...patchSettingsMutation() });

  return (
    <Select
      variants={variants}
      label={label}
      aria-label={!label ? _(msg`language-select.label`) : undefined}
      withChevron={withChevron}
      icon={withIcon ? <Languages className="size-5" /> : undefined}
      items={LANGUAGES}
      value={i18n.locale}
      onChange={(key) => {
        if (key) {
          setLang(key.toString());
          if (isPersisted) mutate({ name: "interface", content: { language: key.toString() } });
        }
      }}
    >
      {LANGUAGES.map(({ id, value }) => (
        <Select.ListBoxItem id={id} textValue={value} key={id}>
          {value}
        </Select.ListBoxItem>
      ))}
    </Select>
  );
}
