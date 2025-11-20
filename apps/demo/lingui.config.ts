import type { LinguiConfig } from "@lingui/conf";
import rootConfig from "../../lingui.config";

const { catalogs, ...baseConfig } = rootConfig;

const config: LinguiConfig = {
  ...baseConfig,
  catalogs: [
    ...catalogs || [],
    {
      path: "./locales/{locale}/messages",
      include: ["./src"],
    },
  ],
  catalogsMergePath: "src/app/locales/{locale}",
};

export default config;
