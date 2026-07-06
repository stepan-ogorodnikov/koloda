import type { PropsWithChildren } from "react";
import { tv } from "tailwind-variants";
import type { TWVProps } from "../types";
import { useLayoutHeaderScroll } from "./header-scroll";

const layoutHeader = tv({
  base: [
    "flex flex-col items-center min-h-14 border-b-2 border-transparent",
    "box-content overflow-hidden animate-colors",
  ],
  variants: {
    type: { sidebar: "border-main", content: "" },
    isScrolled: { true: "border-main", false: "" },
  },
});

type LayoutHeaderProps = PropsWithChildren & TWVProps<typeof layoutHeader>;

export function LayoutHeader({ variants, children }: LayoutHeaderProps) {
  const scrollContext = useLayoutHeaderScroll();
  const contextIsScrolled = scrollContext?.isScrolled ?? false;
  const isScrolled = variants?.isScrolled ?? contextIsScrolled;

  return (
    <div className={layoutHeader({ ...variants, isScrolled })}>
      <div className="flex flex-row items-center wd:gap-2 w-full min-w-0 max-w-main min-h-14 wd:h-14 px-2">
        {children}
      </div>
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
