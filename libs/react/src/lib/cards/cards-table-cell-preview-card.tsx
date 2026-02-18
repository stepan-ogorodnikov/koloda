import type { Card } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Eye } from "lucide-react";
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
          <Eye className="size-5 stroke-1.5" aria-hidden="true" />
        </div>
      </Button>
      <CardPreview isOpen={isOpen} onOpenChange={setIsOpen} templateId={card.templateId} card={card} />
    </Dialog.Root>
  );
}
