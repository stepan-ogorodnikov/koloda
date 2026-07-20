import type { TWVProps } from "@koloda/ui";
import type { PropsWithChildren } from "react";
import { useRef } from "react";
import { useSelectHotkeys } from "./select-behavior";
import { selectListBox } from "./select-list-box";

export type SelectEmptyContentProps = TWVProps<typeof selectListBox> & PropsWithChildren;

export function SelectEmptyContent({ variants, children }: SelectEmptyContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  useSelectHotkeys(ref);

  return (
    <div ref={ref} className={selectListBox(variants)}>
      {children}
    </div>
  );
}
