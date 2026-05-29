import type { TWVProps } from "@koloda/ui";
import type { ComponentProps, PropsWithChildren } from "react";
import { tv } from "tailwind-variants";

const layoutContent = tv({
  base: [
    "grow flex-col h-full min-h-0 min-w-0 overflow-hidden",
    "wd:w-full wd:max-w-main wd:grow-0 wd:basis-full wd:mx-auto",
  ],
  variants: { hasContent: { true: "flex", false: "hidden" } },
});

type LayoutContentProps = PropsWithChildren & TWVProps<typeof layoutContent>;

export function LayoutContent({ variants, children }: LayoutContentProps) {
  return <div className={layoutContent(variants)}>{children}</div>;
}

type LayoutContainerProps = ComponentProps<"div">;

export function LayoutContainer(props: LayoutContainerProps) {
  return (
    <div
      className="grow flex flex-col w-full max-w-main mx-auto min-w-0 min-h-0 overflow-y-auto no-focus-ring"
      {...props}
    />
  );
}
