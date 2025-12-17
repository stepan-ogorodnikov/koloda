import { ToggleGroup } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { atom, useAtom } from "jotai";

export const cardsViewAtom = atom<"table" | "stack">("table");

export function CardsViewToggle() {
  const { _ } = useLingui();
  const [value, setValue] = useAtom(cardsViewAtom);

  return (
    <ToggleGroup
      variants={{ class: "max-tb:hidden" }}
      selectedKeys={[value]}
      onSelectionChange={([value]) => {
        if (value === "table" || value === "stack") setValue(value);
      }}
    >
      <ToggleGroup.Item id="table">{_(msg`cards.views.table`)}</ToggleGroup.Item>
      <ToggleGroup.Item id="stack">{_(msg`cards.views.stack`)}</ToggleGroup.Item>
    </ToggleGroup>
  );
}
