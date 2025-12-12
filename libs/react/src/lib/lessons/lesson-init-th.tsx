import { tableHeadCellContent } from "@koloda/ui";
import type { PropsWithChildren } from "react";

export function LessonInitTh({ children }: PropsWithChildren) {
  return (
    <th>
      <div className={tableHeadCellContent({ class: "h-10 whitespace-nowrap" })}>{children}</div>
    </th>
  );
}
