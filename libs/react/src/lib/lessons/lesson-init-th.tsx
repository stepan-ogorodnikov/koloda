import { tableHeadCell } from "@koloda/ui";
import type { PropsWithChildren } from "react";

export function LessonInitTh({ children }: PropsWithChildren) {
  return (
    <th>
      <div className={tableHeadCell({ class: "h-10" })}>{children}</div>
    </th>
  );
}
