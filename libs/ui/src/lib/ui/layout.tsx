import type { PropsWithChildren } from "react";
import "@fontsource-variable/inter";
import "../global.css";

export function Layout({ children }: PropsWithChildren) {
  return <div className="flex min-w-screen min-h-screen">{children}</div>;
}
