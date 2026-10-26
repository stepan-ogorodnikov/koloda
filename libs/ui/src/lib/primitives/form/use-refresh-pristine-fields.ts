import { evaluate, getBy } from "@tanstack/react-form";
import type { AnyFormApi, DeepKeys } from "@tanstack/react-form";
import { useEffect, useRef } from "react";

// WHY: TanStack Form adopts new default values only while the whole form is untouched
// (FormApi.update). Each path is one sync group, so saving a group the user did not change
// with its old value captures a fresh write that undoes another device's change
// (crates/koloda-sync-proto/PROTOCOL.md, Field groups and merge).
// A group follows the data while its value still equals the data the form last saw.
// Values are compared, not field meta: TanStack keeps `isDirty` set after an edit is undone.
// Discard needs nothing here: `useForm` passes the latest `defaultValues` to `update()` on
// every render, and `reset()` reads them.
export function useRefreshPristineFields<TFormData>(
  form: AnyFormApi,
  latest: TFormData | null | undefined,
  paths: readonly DeepKeys<TFormData>[],
) {
  const previousRef = useRef(latest);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = latest;
    if (!previous || !latest) return;

    for (const path of paths) {
      const value = getBy(latest, path);
      const shown = getBy(form.state.values, path);
      if (evaluate(shown, value) || !evaluate(shown, getBy(previous, path))) continue;
      form.setFieldValue(path, value, { dontUpdateMeta: true });
    }
  }, [form, latest, paths]);
}
