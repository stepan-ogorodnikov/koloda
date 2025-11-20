import type { LinguiConfig } from "@lingui/conf";

const config: LinguiConfig = {
  locales: ["en", "ru"],
  fallbackLocales: {
    default: "en",
  },
  catalogs: [
    {
      path: "../../libs/srs/locales/{locale}/messages",
      include: ["../../libs/srs/src"],
    },
    {
      path: "../../libs/ui/locales/{locale}/messages",
      include: ["../../libs/ui/src"],
    },
    {
      path: "../../libs/react/locales/{locale}/messages",
      include: ["../../libs/react/src"],
    },
  ],
  compileNamespace: "ts",
};

export default config;
