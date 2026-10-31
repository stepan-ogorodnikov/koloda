import { LANGUAGES } from "@koloda/app";
import { langAtom } from "@koloda/core-react";
import { LanguageIcon, Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useSetAtom } from "jotai";
import { useInterfaceSettingWrite } from "./use-interface-setting-write";

type LanguagePickerProps = Partial<SelectProps<(typeof LANGUAGES)[number]>> & {
  showIcon?: boolean;
  isPersisted?: boolean;
};

export function LanguagePicker({ label, showIcon = true, isPersisted = true, ...props }: LanguagePickerProps) {
  const { _, i18n } = useLingui();
  const setLang = useSetAtom(langAtom);
  const write = useInterfaceSettingWrite();

  return (
    <Select
      popoverVariants={{ class: "min-w-48 w-[var(--trigger-width)]" }}
      label={label}
      aria-label={!label ? _(msg`language-picker.label`) : undefined}
      icon={showIcon ? <LanguageIcon className="size-5" strokeWidth={1.75} aria-hidden="true" /> : undefined}
      items={LANGUAGES}
      value={i18n.locale}
      onChange={(key) => {
        if (!key) return;
        if (isPersisted) write("language", key.toString());
        else setLang(key.toString());
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
