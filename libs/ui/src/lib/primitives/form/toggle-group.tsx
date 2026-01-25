import { button, type TWVProps, useMotionSetting } from "@koloda/ui";
import { motion } from "motion/react";
import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";
import { useId } from "react-aria";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import type { ToggleButtonGroupProps, ToggleButtonProps } from "react-aria-components";
import { tv } from "tailwind-variants";

const ToggleGroupContext = createContext<string>("");

export const toggleGroup = tv({
  base: "flex flex-row items-center h-10  border-2 bg-toggle-group border-toggle-group rounded-lg",
});

type ToggleGroupProps = ToggleButtonGroupProps & TWVProps<typeof toggleGroup>;

export function ToggleGroup({ variants, ...props }: ToggleGroupProps) {
  const id = useId();

  return (
    <ToggleGroupContext.Provider value={id}>
      <ToggleButtonGroup className={toggleGroup(variants)} {...props} />
    </ToggleGroupContext.Provider>
  );
}

export const toggleGroupItem = tv({
  extend: button,
  base: "relative -m-0.5 fg-level-3 aria-checked:fg-level-1 hover:fg-level-1",
});

type ToggleGroupItemProps = ToggleButtonProps & PropsWithChildren & TWVProps<typeof toggleGroupItem>;

export function ToggleGroupItem({ variants, children, ...props }: ToggleGroupItemProps) {
  const isMotionOn = useMotionSetting();
  const id = useContext(ToggleGroupContext);

  return (
    <ToggleButton className={toggleGroupItem(variants || {})} {...props}>
      {({ isSelected }) => (
        <>
          {isSelected && (
            <motion.div
              className="absolute z-1 inset-0 border-2 rounded-lg border-toggle-group-active bg-toggle-group-active shadow-toggle-group-active"
              layoutId={id}
              transition={isMotionOn ? { duration: 0.25, ease: "easeInOut" } : { duration: 0 }}
            />
          )}
          <span className="z-2">{children}</span>
        </>
      )}
    </ToggleButton>
  );
}

ToggleGroup.Item = ToggleGroupItem;
