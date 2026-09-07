import { HOTKEY_SCOPE_LABELS, HOTKEYS_LABELS, hotkeysSettingsValidation as schema } from "@koloda/app";
import type { HotkeyScope, HotkeysSettings } from "@koloda/app";
import { objectEntries, toFormErrors } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { AddHotkeyButton, FormLayout, formLayout, useAppForm } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import type { DeepKeys } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { SettingsHotkeysHotkey } from "./settings-hotkeys-hotkey";

export type SettingsHotkeysProps = { data: HotkeysSettings };

type HotkeyFieldPath = {
  [Scope in HotkeyScope]: {
    [Id in keyof HotkeysSettings[Scope] & string]: `${Scope}.${Id}`;
  }[keyof HotkeysSettings[Scope] & string];
}[HotkeyScope];

type HotkeysErrorMap = {
  onChange?: Record<string, unknown>;
  onSubmit?: Record<string, unknown>;
};

export function SettingsHotkeys({ data }: SettingsHotkeysProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { setSettingsMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(setSettingsMutation<"hotkeys">());

  const form = useAppForm({
    defaultValues: data,
    validators: { onSubmit: schema, onChange: schema },
    onSubmit: async ({ value }) => {
      mutate(
        { name: "hotkeys", content: schema.parse(value) },
        {
          onSuccess: (returning) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("hotkeys") });
            queryClient.setQueryData(queryKeys.settings.detail("hotkeys"), returning);
            form.reset(returning?.content);
          },
          onError: (error) => {
            form.setErrorMap({ onSubmit: toFormErrors(error) });
          },
        },
      );
    },
  });
  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  return (
    <form
      className={formLayout}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      {objectEntries(HOTKEY_SCOPE_LABELS).map(([scopeKey, scopeLabel]) => (
        <div key={scopeKey}>
          <FormLayout.Section term={_(scopeLabel)} />
          {Object.entries(HOTKEYS_LABELS[scopeKey]).map(([id, label]) => {
            const fieldPath = `${scopeKey}.${id}` as HotkeyFieldPath;

            return (
              <form.Field key={id} name={fieldPath as DeepKeys<HotkeysSettings>}>
                {(field) => {
                  const value = (field.state.value || []) as string[];

                  return (
                    <FormLayout.Section term={_(label)}>
                      <div className="flex flex-row items-center gap-4 flex-wrap">
                        {value.map((hotkey, index) => (
                          <SettingsHotkeysHotkey
                            value={hotkey}
                            onChange={(v) => {
                              const newValue = [...value];
                              if (v) {
                                newValue[index] = v;
                              } else {
                                newValue.splice(index, 1);
                              }
                              field.handleChange(newValue);
                            }}
                            hasError={hasFieldError(formErrorMap, fieldPath, index)}
                            key={`${id}-${index}`}
                          />
                        ))}
                        <AddHotkeyButton onAdd={(hotkey) => field.pushValue(hotkey as never)} />
                      </div>
                    </FormLayout.Section>
                  );
                }}
              </form.Field>
            );
          })}
        </div>
      ))}
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </form>
  );
}

function hasFieldError(formErrorMap: HotkeysErrorMap, fieldPath: string, index: number): boolean {
  const fullPath = `${fieldPath}[${index}]`;
  const fieldErrors = formErrorMap.onChange?.[fullPath] || formErrorMap.onSubmit?.[fullPath];
  if (!Array.isArray(fieldErrors)) return false;

  return fieldErrors.some((error) => {
    if (typeof error !== "object" || error == null || !("path" in error)) return false;
    const path = error.path;
    return Array.isArray(path) && path[2] === index;
  });
}
