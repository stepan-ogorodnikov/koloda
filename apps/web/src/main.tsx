import { AppProviders } from "@koloda/app-react";
import { createRoot } from "react-dom/client";
import { activateLanguage, getLanguage } from "./app/i18n";
import { store } from "./app/store";

createRoot(document.getElementById("root") as HTMLElement).render(
  <AppProviders
    store={store}
    basepath={import.meta.env.VITE_BASE}
    activateLanguage={activateLanguage}
    getLanguage={getLanguage}
  />,
);
