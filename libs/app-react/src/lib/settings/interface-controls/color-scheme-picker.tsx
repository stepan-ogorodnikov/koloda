import { ComputerPhoneSyncIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SCHEMES } from "@koloda/app";
import { queriesAtom, schemeAtom } from "@koloda/core-react";
import { Select } from "@koloda/ui";
import type { SelectProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";

const ITEMS = [
  { id: "light", Icon: Sun03Icon },
  { id: "dark", Icon: Moon02Icon },
  { id: "system", Icon: ComputerPhoneSyncIcon },
] as const;

type ColorSchemePicker = Partial<SelectProps<(typeof ITEMS)[number]>> & {
  isPersisted?: boolean;
};

export function ColorSchemePicker({ isPersisted = true, ...props }: ColorSchemePicker) {
  const { _ } = useLingui();
  const [scheme, setScheme] = useAtom(schemeAtom);
  const { patchSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(patchSettingsMutation());

  return (
    <Select
      popoverVariants={{ class: "min-w-48" }}
      aria-label={_(msg`color-scheme-picker.label`)}
      items={ITEMS}
      value={scheme}
      onChange={(key) => {
        if (key) {
          setScheme(key.toString());
          if (isPersisted) mutate({ name: "interface", content: { scheme: key.toString() } });
        }
      }}
      {...props}
    >
      {({ id, Icon }) => (
        <Select.ListBoxItem id={id} textValue={_(SCHEMES[id])} key={id}>
          <span className="flex flex-row items-center gap-2">
            <HugeiconsIcon className="size-5" strokeWidth={1.75} icon={Icon} aria-hidden="true" />
            <Trans id={SCHEMES[id].id} />
          </span>
        </Select.ListBoxItem>
      )}
    </Select>
  );
}
