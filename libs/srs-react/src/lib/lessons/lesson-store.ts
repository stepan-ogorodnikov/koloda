import { atom } from "jotai";
import { lessonReducer, lessonReducerDefault } from "./lesson-reducer";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

const lessonStateBaseAtom = atom<LessonReducerState>(lessonReducerDefault);

export const lessonStateAtom = atom(
  (get) => get(lessonStateBaseAtom),
  (get, set, action: LessonReducerAction) => {
    const prev = get(lessonStateBaseAtom);
    const next = lessonReducer(prev, action);
    // INVARIANT: no-op actions keep the same state identity; never replace from outside the reducer.
    if (next === prev) return;
    set(lessonStateBaseAtom, next);
  },
);
