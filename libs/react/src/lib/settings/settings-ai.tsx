import type { AIProfile } from "@koloda/srs";
import { AI_PROVIDER_LABELS } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { SettingsAIAddProfile } from "./settings-ai-add-profile";
import { SettingsAIDeleteProfile } from "./settings-ai-delete-profile";
import { SettingsAIEditProfile } from "./settings-ai-edit-profile";

export type SettingsAiProps = { data: AIProfile[] };

export function SettingsAi({ data }: SettingsAiProps) {
  const { _ } = useLingui();

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">{_(msg`settings.ai.profiles.title`)}</h2>
        <SettingsAIAddProfile />
      </div>
      {data.length === 0
        ? <p className="text-center py-8 fg-level-3">{_(msg`settings.ai.profiles.empty`)}</p>
        : (
          <div className="flex flex-col gap-2">
            {data.map((profile) => (
              <div className="flex flex-row items-center gap-4" key={profile.id}>
                <div className={profile.title ? undefined : "fg-disabled"}>
                  {profile.title || _(msg`settings.ai.profiles.title.placeholder`)}
                </div>
                <div className="fg-level-2">
                  {profile.secrets ? AI_PROVIDER_LABELS[profile.secrets.provider] : ""}
                </div>
                <div className="flex flex-row gap-1">
                  <div>
                    <SettingsAIEditProfile profile={profile} />
                  </div>
                  <div>
                    <SettingsAIDeleteProfile profile={profile} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
