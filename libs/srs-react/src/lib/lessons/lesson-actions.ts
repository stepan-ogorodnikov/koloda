import type { LessonData } from "@koloda/srs";
import { atom } from "jotai";
import type { InitializePayload, LessonAtomValue } from "./lesson-reducer";
import { lessonRequestAtom } from "./lesson-selectors";
import { lessonStateAtom } from "./lesson-store";

export const openLessonAtom = atom(null, (_get, set, request: LessonAtomValue) => {
  set(lessonStateAtom, ["open", request]);
});

export const initializeLessonAtom = atom(null, (_get, set, payload: InitializePayload) => {
  set(lessonStateAtom, ["initialize", payload]);
});

export const receiveLessonDataAtom = atom(null, (_get, set, data: LessonData) => {
  set(lessonStateAtom, ["lessonDataReceived", data]);
});

export const updateLessonAmountAtom = atom(
  null,
  (_get, set, payload: { type: "untouched" | "learn" | "review"; value: number }) => {
    set(lessonStateAtom, ["amountUpdated", payload]);
  },
);

export const submitLessonSetupAtom = atom(null, (_get, set) => {
  set(lessonStateAtom, ["setupSubmitted"]);
});

export const updateLessonCardFormAtom = atom(null, (_get, set, payload: { key: number | string; value: string }) => {
  set(lessonStateAtom, ["cardFormUpdated", payload]);
});

export const submitLessonCardAtom = atom(null, (_get, set) => {
  set(lessonStateAtom, ["cardSubmitted"]);
});

export const selectLessonGradeAtom = atom(null, (_get, set, gradeIndex: number) => {
  set(lessonStateAtom, ["gradeSelected", gradeIndex]);
});

export const requestLessonTerminationAtom = atom(null, (_get, set) => {
  set(lessonStateAtom, ["terminationRequested", true]);
});

export const cancelLessonTerminationAtom = atom(null, (_get, set) => {
  set(lessonStateAtom, ["terminationRequested", false]);
});

export const closeLessonStateAtom = atom(null, (_get, set) => {
  set(lessonStateAtom, ["close"]);
});

export const settleLessonUploadAtom = atom(
  null,
  (_get, set, payload: { index: number; status: "success" | "error" }) => {
    set(lessonStateAtom, ["resultUploaded", payload]);
  },
);

// INVARIANT: Compatibility atom — read request; write request → open; write
// null → close. Not a second open-state atom.
export const lessonAtom = atom(
  (get) => get(lessonRequestAtom),
  (_get, set, value: LessonAtomValue | null) => {
    if (value === null) {
      set(closeLessonStateAtom);
      return;
    }
    set(openLessonAtom, value);
  },
);
