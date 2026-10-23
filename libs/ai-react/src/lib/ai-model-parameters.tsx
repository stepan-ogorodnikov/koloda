import type { ModelParameter } from "@koloda/ai";
import { BrainIcon, Select } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AIModelParametersProps = {
  parameters: ModelParameter[];
  onChange: (type: ModelParameter["type"], value: string) => void;
};

// WHY: the listbox drops an empty key, so Default needs a key of its own. It maps
// to "" both ways; "" clears the stored level and the run sends none.
const PROVIDER_DEFAULT_KEY = "__provider-default__";

export function AIModelParameters({ parameters, onChange }: AIModelParametersProps) {
  const { _ } = useLingui();

  return parameters.map((param) => {
    switch (param.type) {
      case "reasoning_effort": {
        const items = param.hasDefault
          ? param.levels
          : [{ effort: PROVIDER_DEFAULT_KEY, description: "" }, ...param.levels];
        return (
          <Select<{ effort: string; description: string }>
            buttonVariants={{ style: "ghost" }}
            popoverVariants={{ class: "min-w-48" }}
            aria-label={_(msg`ai.model-parameters.reasoning-effort.label`)}
            icon={<BrainIcon className="size-5 min-w-5" strokeWidth={1.5} aria-hidden="true" />}
            items={items}
            value={!param.hasDefault && param.value === "" ? PROVIDER_DEFAULT_KEY : param.value}
            onChange={(key) => key && onChange(param.type, key === PROVIDER_DEFAULT_KEY ? "" : key.toString())}
            key={param.type}
          >
            {(item) => {
              const label =
                item.effort === PROVIDER_DEFAULT_KEY
                  ? _(msg`ai.model-parameters.reasoning-effort.default`)
                  : item.effort;
              return (
                <Select.ListBoxItem id={item.effort} textValue={label} key={item.effort}>
                  {label}
                </Select.ListBoxItem>
              );
            }}
          </Select>
        );
      }
      default:
        return null;
    }
  });
}
