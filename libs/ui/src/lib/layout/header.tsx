import type { TWVProps } from "@koloda/ui";
import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

const layoutHeader = tv({
  base: "flex flex-row items-center wd:gap-2 w-full min-w-0 min-h-14 wd:h-14 px-2",
  variants: {
    type: { sidebar: "border-b-2 border-main", content: "" },
  },
});

type LayoutHeaderProps = PropsWithChildren & TWVProps<typeof layoutHeader>;

export function LayoutHeader({ variants, children }: LayoutHeaderProps) {
  return (
    <div className="min-h-14 overflow-hidden">
      <div className={layoutHeader(variants)}>{children}</div>
    </div>
  );
}

const layoutH1 = tv({
  base: "p-2 text-lg/6 truncate",
  variants: {
    grow: { true: "grow", false: "" },
  },
  defaultVariants: { grow: true },
});

type LayoutH1Props = PropsWithChildren & TWVProps<typeof layoutH1>;

export function LayoutH1({ variants, children }: LayoutH1Props) {
  return <h1 className={layoutH1(variants)}>{children}</h1>;
}
