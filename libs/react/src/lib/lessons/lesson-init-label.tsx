import type { PropsWithChildren } from "react";
import { LessonInitTd } from "./lesson-init-td";

export function LessonInitLabel({ children }: PropsWithChildren) {
  return (
    <LessonInitTd>
      <div className="w-32 text-lg font-semibold">
        {children}
      </div>
    </LessonInitTd>
  );
}
