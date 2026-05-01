import type { ModelParameter } from "@koloda/ai";
import { Select } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export type AIModelParametersProps = {
  parameters: ModelParameter[];
  onChange: (type: ModelParameter["type"], value: string) => void;
};

export function AIModelParameters({ parameters, onChange }: AIModelParametersProps) {
  const { _ } = useLingui();

  return parameters.map((param) => {
    switch (param.type) {
      case "reasoning_effort":
        return (
          <Select<{ effort: string; description: string }>
            buttonVariants={{ style: "ghost" }}
            popoverVariants={{ class: "min-w-48" }}
            aria-label={_(msg`ai.model-parameters.reasoning-effort.label`)}
            items={param.levels}
            value={param.value}
            onChange={(key) => key && onChange(param.type, key.toString())}
            key={param.type}
          >
            {(item) => (
              <Select.ListBoxItem id={item.effort} textValue={item.effort} key={item.effort}>
                {item.effort}
              </Select.ListBoxItem>
            )}
          </Select>
        );
      default:
        return null;
    }
  });
}
