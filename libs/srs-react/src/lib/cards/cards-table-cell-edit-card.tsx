import { Edit03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Card } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";
import { CardDetails } from "./card-details";

type CardsTableCellEditCardProps = { card: Card };

export function CardsTableCellEditCard({ card }: CardsTableCellEditCardProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        variants={{ style: "ghost", size: "icon", class: "group w-full p-1 rounded-none no-focus-ring" }}
        aria-label={_(msg`edit-card.trigger`)}
      >
        <div className="p-1 rounded-md group-focus-ring">
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Edit03Icon} aria-hidden="true" />
        </div>
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ size: "main" }}>
          <Dialog.Body>
            <Dialog.Content>
              <div className="relative fg-level-1">
                <Dialog.Close variants={{ class: "absolute top-0 right-0" }} slot="close" />
                <CardDetails card={card} />
              </div>
            </Dialog.Content>
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
