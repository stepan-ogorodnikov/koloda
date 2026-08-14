import type { AIProfile } from "@koloda/ai";
import { AI_PROVIDER_LABELS, AI_PROVIDERS } from "@koloda/ai";
import { aiProvidersAtom } from "@koloda/core-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue } from "jotai";
import { SettingsAIAddProfile } from "./settings-ai-add-profile";
import { SettingsAIDeleteProfile } from "./settings-ai-delete-profile";
import { SettingsAIEditProfile } from "./settings-ai-edit-profile";
import { SettingsAIProfileModels } from "./settings-ai-profile-models";

export type SettingsAiProps = { data: AIProfile[] };

export function SettingsAi({ data }: SettingsAiProps) {
  const { _ } = useLingui();
  const providerIds = useAtomValue(aiProvidersAtom);
  const showBrowserCorsNote = AI_PROVIDERS.some((id) => !providerIds.includes(id));

  return (
    <div className="self-center flex flex-col gap-4 w-full max-w-main p-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">{_(msg`settings.ai.profiles.title`)}</h2>
        <SettingsAIAddProfile />
      </div>
      {showBrowserCorsNote ? <p className="fg-level-3">{_(msg`settings.ai.browser-cors.note`)}</p> : null}
      {data.length === 0 ? (
        <p className="text-center py-8 fg-level-3">{_(msg`settings.ai.profiles.empty`)}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((profile) => {
            const provider = profile.secrets?.provider;
            const unsupported = provider !== undefined && !providerIds.includes(provider);
            return (
              <div className="flex flex-col gap-1" key={profile.id}>
                <div className="flex flex-row items-center gap-4">
                  <div className={profile.title ? undefined : "fg-disabled"}>
                    {profile.title || _(msg`settings.ai.profiles.title.placeholder`)}
                  </div>
                  <div className="fg-level-2">{provider ? AI_PROVIDER_LABELS[provider] : ""}</div>
                  <div className="flex flex-row gap-1">
                    <div>
                      <SettingsAIEditProfile profile={profile} />
                    </div>
                    <div>
                      <SettingsAIProfileModels profile={profile} />
                    </div>
                    <div>
                      <SettingsAIDeleteProfile profile={profile} />
                    </div>
                  </div>
                </div>
                {unsupported ? <p className="fg-level-3 text-sm">{_(msg`settings.ai.browser-cors.profile`)}</p> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
