import type { PropsWithChildren } from "react";
import { Switch as ReactAriaSwitch } from "react-aria-components";
import type { SwitchProps as ReactAriaSwitchProps } from "react-aria-components";
import { label } from "./label";

const switchVariants = "group flex flex-row items-center gap-2 min-h-10 rounded-lg focus-ring";

export type SwitchProps = ReactAriaSwitchProps & PropsWithChildren;

export function Switch(props: SwitchProps) {
  return <ReactAriaSwitch className={switchVariants} {...props} />;
}

const switchIndicator = [
  "flex flex-row items-center justify-start h-7 w-12 px-0.75 cursor-pointer",
  "rounded-full border-2 border-switch bg-switch shadow-switch",
  "group-selected:bg-switch-selected group-selected:border-switch-selected",
].join(" ");

const switchIndicatorBullet = [
  "size-5 rounded-full bg-switch-bullet",
  "transition duration-200 ease-in-out translate-x-0 group-selected:translate-x-full",
].join(" ");

function SwitchIndicator() {
  return (
    <div className={switchIndicator}>
      <div className={switchIndicatorBullet} />
    </div>
  );
}

function SwitchLabel({ children }: PropsWithChildren) {
  return (
    <span className={label()}>
      {children}
    </span>
  );
}

Switch.Indicator = SwitchIndicator;
Switch.Label = SwitchLabel;
