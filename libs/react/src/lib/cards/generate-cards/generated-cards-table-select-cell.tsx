import { Checkbox, Fade, tableCellContent } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { Row } from "@tanstack/react-table";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { CardWithStatus } from "./use-generated-cards-table";

export function GeneratedCardsTableSelectCell({ row }: { row: Row<CardWithStatus> }) {
  const { _ } = useLingui();
  const status = row.original.status;
  const isSelected = row.getIsSelected();
  const isSelectable = row.getCanSelect();

  return (
    <AnimatePresence mode="wait" initial={false}>
      {status === "idle" && (
        <Fade className={tableCellContent()} key="checkbox">
          <Checkbox
            isSelected={isSelected}
            isDisabled={!isSelectable}
            onChange={(selected) => {
              row.toggleSelected(selected);
            }}
          >
            <Checkbox.Indicator />
          </Checkbox>
        </Fade>
      )}
      {status === "pending" && (
        <Fade className={tableCellContent()} key="pending">
          <Loader2
            className="size-5 fg-level-4 animate-spin"
            aria-label={_(msg`generate-cards.table.columns.status.pending`)}
          />
        </Fade>
      )}
      {status === "success" && (
        <Fade className={tableCellContent()} key="success">
          <CircleCheck className="size-5 fg-success" aria-label={_(msg`generate-cards.table.columns.status.success`)} />
        </Fade>
      )}
      {status === "error" && (
        <Fade className={tableCellContent()} key="error">
          <CircleX className="size-5 fg-error" aria-label={_(msg`generate-cards.table.columns.status.error`)} />
        </Fade>
      )}
    </AnimatePresence>
  );
}
