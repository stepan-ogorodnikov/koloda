import { queriesAtom } from "@koloda/react";
import { useMutation } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useEffectEvent } from "react";
import type { ActionDispatch } from "react";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

type LessonUploaderProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonUploader({ state, dispatch }: LessonUploaderProps) {
  const { queue: [result] } = state.upload;
  const { index, card, review } = result || {};
  const { submitLessonResultMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(submitLessonResultMutation());

  const upload = useEffectEvent((index: number | undefined) => {
    if (index !== undefined && index === result.index) {
      mutate({ card, review }, {
        onSuccess: () => {
          dispatch(["resultUploaded", { index, status: "success" }]);
        },
        onError: () => {
          dispatch(["resultUploaded", { index, status: "error" }]);
        },
      });
    }
  });

  useEffect(() => {
    upload(index);
  }, [index]); // oxlint-disable-line react/exhaustive-deps

  return null;
}
