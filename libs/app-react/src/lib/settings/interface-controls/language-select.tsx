import { TranslationIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LANGUAGES } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import { queriesAtom } from "@koloda/core-react";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";

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
      icon={withIcon
        ? <HugeiconsIcon className="size-5" strokeWidth={1.75} icon={TranslationIcon} aria-hidden="true" />
        : undefined}
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
