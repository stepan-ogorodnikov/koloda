import type { Card } from "@koloda/srs";
import { Checkbox } from "@koloda/ui";
import type { CardsTableFeatures } from "@koloda/ui";
import type { Table } from "@tanstack/react-table";

export type CardsTableHeaderSelectProps = {
  table: Table<CardsTableFeatures, Card>;
};

export function CardsTableHeaderSelect({ table }: CardsTableHeaderSelectProps) {
  const allRows = table.getRowModel().rows;
  const selectedCount = allRows.filter((row) => row.getIsSelected()).length;
  const isAllSelected = selectedCount === allRows.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < allRows.length;

  const handleChange = (isSelected: boolean) => {
    table.toggleAllRowsSelected(isSelected);
  };

  if (allRows.length === 0) return null;

  return (
    <Checkbox isSelected={isAllSelected} isIndeterminate={isIndeterminate} onChange={handleChange}>
      <Checkbox.Indicator />
    </Checkbox>
  );
}
