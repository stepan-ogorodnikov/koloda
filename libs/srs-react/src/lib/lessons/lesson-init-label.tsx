import type { PropsWithChildren } from "react";
import { LessonInitTd } from "./lesson-init-td";

export function LessonInitLabel({ children }: PropsWithChildren) {
  return (
    <LessonInitTd>
      <div className="tb:w-28 pr-4 font-semibold">
        {children}
      </div>
    </LessonInitTd>
  );
}
