import { SettingsInterface } from "@koloda/react";
import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/settings/interface")({
  component: SettingsInterface,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["settings", "interface"], ...getSettingsQuery("interface") });
    return { title: msg`title.settings.interface` };
  },
});
