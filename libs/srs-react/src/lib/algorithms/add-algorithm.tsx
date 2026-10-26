import { toFormErrors } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { DEFAULT_FSRS_ALGORITHM, insertAlgorithmSchema as schema } from "@koloda/srs";
import type { Algorithm } from "@koloda/srs";
import {
  AddIcon,
  Button,
  Dialog,
  Label,
  Link,
  link,
  TextField,
  Tooltip,
  useAppForm,
  useMotionSetting,
} from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useEntityCreatedLink } from "../components/use-entity-created-link";

export function AddAlgorithm() {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { addAlgorithmMutation } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const { mutateAsync, isSuccess } = useMutation(addAlgorithmMutation());
  const { linkRef, newId, clearNewId, handleCreated, isLinkVisible } = useEntityCreatedLink<Algorithm["id"]>(isSuccess);
  const [isOpen, setIsOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { title: "", content: DEFAULT_FSRS_ALGORITHM },
    validators: { onSubmit: schema },
    listeners: {
      onChange: () => {
        clearNewId();
      },
    },
    onSubmit: async ({ value, formApi }) => {
      // WHY: await the add so the form stays submitting until it settles; canSubmit stays
      // false meanwhile, so a second press cannot add twice.
      let returning;
      try {
        returning = await mutateAsync(schema.parse(value));
      } catch (error) {
        formApi.setErrorMap({ onSubmit: toFormErrors(error) });
        return;
      }
      formApi.reset();
      handleCreated(returning);
      queryClient.invalidateQueries({ queryKey: queryKeys.algorithms.all() });
    },
  });

  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  useEffect(() => {
    clearNewId();
    form.reset();
  }, [isOpen, form, clearNewId]);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Tooltip content={_(msg`add-algorithm.trigger`)}>
        <Button variants={{ style: "dashed", size: "icon" }} aria-label={_(msg`add-algorithm.trigger`)}>
          <AddIcon className="size-4 min-w-4" strokeWidth={3} aria-hidden="true" />
        </Button>
      </Tooltip>
      <Dialog.Popover variants={{ class: "min-w-84" }}>
        <Dialog.Body>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>{_(msg`add-algorithm.title`)}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content variants={{ class: "min-h-34" }}>
              <form.Field name="title">
                {(field) => (
                  <TextField
                    aria-label={_(msg`add-algorithm.inputs.title.label`)}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e)}
                  >
                    <Label>{_(msg`add-algorithm.inputs.title.label`)}</Label>
                    <TextField.Input />
                  </TextField>
                )}
              </form.Field>
              <div className="min-h-10 mt-4">
                {formErrorMap.onSubmit && <form.Errors errors={formErrorMap.onSubmit} />}
              </div>
            </Dialog.Content>
            <Dialog.Footer>
              {isLinkVisible && (
                <Link
                  className={link({ type: "added" })}
                  ref={linkRef}
                  to="/algorithms/$algorithmId"
                  params={{ algorithmId: newId }}
                  onClick={() => setIsOpen(false)}
                  viewTransition={isMotionOn}
                >
                  {_(msg`add-algorithm.redirect.link`)}
                </Link>
              )}
              <div className="grow" />
              <form.Subscribe selector={(state) => [state.canSubmit]}>
                {([canSubmit]) => (
                  <Button variants={{ style: "primary" }} type="submit" isDisabled={!canSubmit}>
                    {_(msg`add-algorithm.submit`)}
                  </Button>
                )}
              </form.Subscribe>
            </Dialog.Footer>
          </form>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
