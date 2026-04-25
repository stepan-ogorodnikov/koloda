import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

const VARIABLES = [
  { variable: "{{fields}}", label: msg`generate-cards.settings.system-prompt.variables.fields` },
  { variable: "{{rules}}", label: msg`generate-cards.settings.system-prompt.variables.rules` },
  { variable: "{{provider}}", label: msg`generate-cards.settings.system-prompt.variables.provider` },
] as const;

export function GenerateCardsSettingsVariables() {
  const { _ } = useLingui();

  return (
    <div className="flex flex-col gap-2">
      <span className="fg-level-2 font-medium tracking-wide uppercase">
        {_(msg`generate-cards.settings.system-prompt.variables`)}
      </span>
      <div className="flex flex-col gap-2 fg-level-2">
        {VARIABLES.map(({ variable, label }) => (
          <span key={variable}>
            <code className="fg-level-1 font-mono">{variable}</code>
            <span className="mx-2">-</span>
            <span>{_(label)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
