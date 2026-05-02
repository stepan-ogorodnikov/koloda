import type { PropsWithChildren } from "react";

export function LessonInitTd({ children }: PropsWithChildren) {
  return (
    <td className="py-2">
      {children}
    </td>
  );
}
