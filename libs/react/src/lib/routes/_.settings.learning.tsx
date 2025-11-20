import { SettingsLearning } from "@koloda/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/settings/learning")({
  component: SettingsLearning,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["settings", "learning"], ...getSettingsQuery("learning") });
  },
});
