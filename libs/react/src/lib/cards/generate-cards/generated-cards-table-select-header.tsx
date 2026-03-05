import { Checkbox, Fade } from "@koloda/ui";
import type { Table } from "@tanstack/react-table";
import { AnimatePresence } from "motion/react";
import type { CardWithStatus } from "./use-generated-cards-table";

export type GeneratedCardsTableSelectHeaderProps = {
  table: Table<CardWithStatus>;
};

export function GeneratedCardsTableSelectHeader({ table }: GeneratedCardsTableSelectHeaderProps) {
  const allRows = table.getRowModel().rows;
  const selectableRows = allRows.filter((row) => row.original.status === "idle");
  const selectableCount = selectableRows.length;
  const selectedSelectableCount = selectableRows.filter((row) => row.getIsSelected()).length;
  const isAllSelected = selectedSelectableCount === selectableCount;
  const isIndeterminate = selectedSelectableCount > 0 && selectedSelectableCount < selectableCount;

  const handleChange = (isSelected: boolean) => {
    if (isSelected) {
      selectableRows.forEach((row) => {
        if (!row.getIsSelected()) row.toggleSelected(true);
      });
    } else {
      table.toggleAllRowsSelected(false);
    }
  };

  return (
    <AnimatePresence>
      {selectableCount !== 0 && (
        <Fade initial={{ opacity: 1 }} key="checkbox">
          <Checkbox
            isSelected={isAllSelected}
            isIndeterminate={isIndeterminate}
            onChange={handleChange}
          >
            <Checkbox.Indicator />
          </Checkbox>
        </Fade>
      )}
    </AnimatePresence>
  );
}
