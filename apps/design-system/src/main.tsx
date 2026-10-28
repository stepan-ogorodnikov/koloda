import { createRoot } from "react-dom/client";
import { activateEnglish } from "./app/i18n";
import { Providers } from "./app/providers";
import { store } from "./app/store";
import { applyTheme, themeAtom } from "./app/theme";

activateEnglish();
applyTheme(store.get(themeAtom));
// WHY: `motion:` variants key off this class, which `theme-boot.js` sets in the product apps.
document.documentElement.classList.toggle("motion", !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

createRoot(document.getElementById("root") as HTMLElement).render(<Providers />);
