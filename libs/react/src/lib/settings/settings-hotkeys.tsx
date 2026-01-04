import { queriesAtom, settingsQueryKeys } from "@koloda/react";
import type { HotkeysSettings } from "@koloda/srs";
import {
  HOTKEY_SCOPE_LABELS,
  HOTKEYS_LABELS,
  hotkeysSettingsMessages,
  hotkeysSettingsValidation as schema,
  objectEntries,
} from "@koloda/srs";
import { AddHotkeyButton, FormLayout, formLayout, HotkeyRecorder, useAppForm } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

export function SettingsHotkeys() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { setSettingsMutation, getSettingsQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({
    ...getSettingsQuery("hotkeys"),
    queryKey: settingsQueryKeys.detail("hotkeys"),
  });
  const { mutate } = useMutation(setSettingsMutation());

  const form = useAppForm({
    defaultValues: data?.content as HotkeysSettings,
    validators: { onSubmit: schema, onChange: schema },
    onSubmit: async ({ value }) => {
      mutate({ name: "hotkeys", content: schema.parse(value) }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: settingsQueryKeys.detail("hotkeys") });
          form.reset();
        },
      });
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
            const fieldPath = `${scopeKey}.${id}` as any;

            return (
              <form.Field key={id} name={fieldPath}>
                {(field) => {
                  const value = (field.state.value || []) as string[];

                  return (
                    <FormLayout.Section term={_(label)}>
                      <div className="flex flex-row items-center gap-4 flex-wrap">
                        {value.map((hotkey, index) => (
                          <HotkeyRecorder
                            value={hotkey}
                            onChange={(v) => {
                              const newValue = [...value];
                              if (v) {
                                newValue[index] = v;
                              } else {
                                newValue.splice(index, 1);
                              }
                              (field.handleChange as any)(newValue);
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
      {formErrorMap.onChange && <form.Errors errors={formErrorMap.onChange} translations={hotkeysSettingsMessages} />}
      {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} translations={hotkeysSettingsMessages} />}
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </form>
  );
}

function hasFieldError(formErrorMap: any, fieldPath: string, index: number): boolean {
  const fullPath = `${fieldPath}[${index}]`;
  const fieldErrors = formErrorMap.onChange?.[fullPath] || formErrorMap.onSubmit?.[fullPath];
  return Array.isArray(fieldErrors)
    ? fieldErrors.some((error) => error.path && error.path?.[2] === index)
    : false;
}
