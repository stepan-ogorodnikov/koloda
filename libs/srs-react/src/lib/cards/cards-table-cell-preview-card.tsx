import { ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Card } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";
import { CardPreview } from "./card-preview";

type CardsTableCellPreviewCardProps = { card: Card };

export function CardsTableCellPreviewCard({ card }: CardsTableCellPreviewCardProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        variants={{ style: "ghost", size: "icon", class: "group w-full p-1 rounded-none no-focus-ring" }}
        aria-label={_(msg`preview-card.trigger`)}
      >
        <div className="p-1 rounded-md group-focus-ring">
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={ViewIcon} aria-hidden="true" />
        </div>
      </Button>
      <CardPreview isOpen={isOpen} onOpenChange={setIsOpen} templateId={card.templateId} card={card} />
    </Dialog.Root>
  );
}
