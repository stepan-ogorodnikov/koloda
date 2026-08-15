import { useAppHotkey, useHotkeysSettings } from "@koloda/core-react";
import { getCSSVar } from "@koloda/ui";
import { useMediaQuery } from "@react-hook/media-query";
import type { ActionDispatch } from "react";
import { LessonInitList } from "./lesson-init-list";
import { LessonInitTable } from "./lesson-init-table";
import type { LessonReducerAction, LessonReducerState } from "./lesson-reducer";

type LessonInitProps = {
  state: LessonReducerState;
  dispatch: ActionDispatch<[action: LessonReducerAction]>;
};

export function LessonInit({ state, dispatch }: LessonInitProps) {
  const { ui } = useHotkeysSettings();
  const isMobile = useMediaQuery(`(width < ${getCSSVar("--breakpoint-wd")})`);

  useAppHotkey(["Escape"], () => dispatch(["close"]), "lesson", { ignoreInputs: false });

  useAppHotkey(
    ui.submit,
    () => {
      if (["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName || "")) dispatch(["setupSubmitted"]);
    },
    "lesson",
    { ignoreInputs: false, conflictBehavior: "allow" },
  );

  if (!state.setup) return null;

  return isMobile ? (
    <LessonInitList state={state} dispatch={dispatch} />
  ) : (
    <LessonInitTable state={state} dispatch={dispatch} />
  );
}
