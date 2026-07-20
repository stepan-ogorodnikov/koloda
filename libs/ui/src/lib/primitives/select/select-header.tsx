import { Header as ReactAriaHeader } from "react-aria-components";
import type { HeaderProps } from "react-aria-components";

export function SelectHeader(props: HeaderProps) {
  return <ReactAriaHeader className="mx-1 mt-1 px-2 py-1 fg-level-4 truncate select-none" {...props} />;
}
