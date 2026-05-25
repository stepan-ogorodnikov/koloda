import type { PropsWithChildren, ReactNode } from "react";
import "@fontsource-variable/inter";
import { tv } from "tailwind-variants";
import type { TWVProps } from "../types";

const layout = tv({
  base: "flex flex-col min-w-screen min-h-screen h-screen overflow-hidden",
});

type LayoutProps = PropsWithChildren & TWVProps<typeof layout> & {
  titlebar?: ReactNode;
};

export function Layout({ variants, titlebar, children }: LayoutProps) {
  return (
    <div className={layout(variants)}>
      {titlebar}
      <div className="grow flex flex-col items-center min-h-0 w-full">
        {children}
      </div>
    </div>
  );
}
