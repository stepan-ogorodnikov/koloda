import { queriesAtom } from "@koloda/core-react";
import { useMutation } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useEffectEvent } from "react";
import { settleLessonUploadAtom } from "./lesson-actions";
import { lessonUploadHeadAtom } from "./lesson-selectors";

export function useLessonUploader() {
  const result = useAtomValue(lessonUploadHeadAtom);
  const settle = useSetAtom(settleLessonUploadAtom);
  const { index, card, review } = result || {};
  const { submitLessonResultMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(submitLessonResultMutation());

  const upload = useEffectEvent((index: number | undefined) => {
    if (index !== undefined && result && index === result.index) {
      mutate(
        { card, review },
        {
          onSuccess: () => {
            settle({ index, status: "success" });
          },
          onError: () => {
            settle({ index, status: "error" });
          },
        },
      );
    }
  });

  useEffect(() => {
    upload(index);
  }, [index]); // oxlint-disable-line react/exhaustive-deps
}
