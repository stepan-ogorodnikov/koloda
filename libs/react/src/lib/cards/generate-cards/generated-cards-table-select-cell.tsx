import { AlertCircleIcon, CheckmarkCircle02Icon, DashedLineCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Checkbox, Fade, tableCellContent } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { Row } from "@tanstack/react-table";
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
          <HugeiconsIcon
            className="size-4 min-w-4 fg-level-4 animate-spin"
            aria-label={_(msg`generate-cards.table.columns.status.pending`)}
            strokeWidth={1.75}
            icon={DashedLineCircleIcon}
          />
        </Fade>
      )}
      {status === "success" && (
        <Fade className={tableCellContent()} key="success">
          <HugeiconsIcon
            className="size-5 min-w-5 fg-success"
            aria-label={_(msg`generate-cards.table.columns.status.success`)}
            strokeWidth={1.75}
            icon={CheckmarkCircle02Icon}
          />
        </Fade>
      )}
      {status === "error" && (
        <Fade className={tableCellContent()} key="error">
          <HugeiconsIcon
            className="size-5 min-w-5 fg-error"
            aria-label={_(msg`generate-cards.table.columns.status.error`)}
            strokeWidth={1.75}
            icon={AlertCircleIcon}
          />
        </Fade>
      )}
    </AnimatePresence>
  );
}
