import type { Template } from "@koloda/srs";
import { Button, Checkbox, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { SlidersHorizontal } from "lucide-react";
import { VALUES } from "./card-state";

const INITIAL_FILTERS = { state: [], dueAt: { isOverdue: false, isNotDue: false }, templateIds: [] };

export type CardsTableFilters = {
  state: number[];
  dueAt: {
    isOverdue: boolean;
    isNotDue: boolean;
  };
  templateIds: Template["id"][];
};

type CardsTableFiltersProps = {
  filters: CardsTableFilters;
  setFilters: (filters: CardsTableFilters | ((prev: CardsTableFilters) => CardsTableFilters)) => void;
  templates?: Template[];
};

export function CardsTableFilters({ filters, setFilters, templates }: CardsTableFiltersProps) {
  const { _ } = useLingui();
  const resetFilters = () => setFilters(INITIAL_FILTERS);
  const showTemplateFilter = templates && templates.length > 1;

  return (
    <Dialog.Root>
      <Button variants={{ style: "bordered", size: "default" }}>
        <SlidersHorizontal className="size-4 stroke-2" />
        <span>{_(msg`cards-table.filters.trigger`)}</span>
      </Button>
      <Dialog.Popover>
        <Dialog.Content variants={{ class: "gap-4 w-60" }}>
          {showTemplateFilter && (
            <div>
              <h3 className="fg-level-1 leading-10 font-semibold tracking-wide">
                {_(msg`cards-table.filters.template`)}
              </h3>
              {templates.map((template) => (
                <Checkbox
                  isSelected={filters.templateIds.includes(template.id)}
                  onChange={(isSelected) =>
                    setFilters((prev) => ({
                      ...prev,
                      templateIds: isSelected
                        ? [...prev.templateIds, template.id]
                        : prev.templateIds.filter((id) => id !== template.id),
                    }))}
                  key={template.id}
                >
                  <Checkbox.Indicator />
                  <Checkbox.Label>{template.title}</Checkbox.Label>
                </Checkbox>
              ))}
            </div>
          )}
          <div>
            <h3 className="fg-level-1 leading-10 font-semibold tracking-wide">{_(msg`card.labels.state`)}</h3>
            {VALUES.map((value, i) => (
              <Checkbox
                isSelected={filters.state.includes(i)}
                onChange={(isSelected) =>
                  setFilters((prev) => ({
                    ...prev,
                    state: isSelected ? [...prev.state, i] : prev.state.filter((s) => s !== i),
                  }))}
                key={value.t.id}
              >
                <Checkbox.Indicator />
                <Checkbox.Label>{_(value.t)}</Checkbox.Label>
              </Checkbox>
            ))}
          </div>
          <div>
            <h3 className="fg-level-1 leading-10 font-semibold tracking-wide">{_(msg`card.labels.due-at`)}</h3>
            <Checkbox
              isSelected={filters.dueAt.isOverdue}
              onChange={(isSelected) =>
                setFilters((prev) => ({ ...prev, dueAt: { ...prev.dueAt, isOverdue: isSelected } }))}
            >
              <Checkbox.Indicator />
              <Checkbox.Label>{_(msg`cards-table.filters.due-at.values.true`)}</Checkbox.Label>
            </Checkbox>
            <Checkbox
              isSelected={filters.dueAt.isNotDue}
              onChange={(isSelected) =>
                setFilters((prev) => ({ ...prev, dueAt: { ...prev.dueAt, isNotDue: isSelected } }))}
            >
              <Checkbox.Indicator />
              <Checkbox.Label>{_(msg`cards-table.filters.due-at.values.false`)}</Checkbox.Label>
            </Checkbox>
          </div>
          <Button variants={{ style: "primary" }} onPress={resetFilters}>
            {_(msg`cards-table.filters.reset`)}
          </Button>
        </Dialog.Content>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
