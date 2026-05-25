import { Titlebar as SharedTitlebar } from "@koloda/ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Titlebar() {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function tryMount() {
      const tbEl = document.querySelector<HTMLElement>("[data-tauri-decorum-tb]");
      if (tbEl) {
        const existing = tbEl.querySelector<HTMLElement>("[data-tauri-decorum-nav]");
        if (existing) {
          setContainer(existing);
          return true;
        }
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-tauri-decorum-nav", "");
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.height = "100%";
        wrapper.style.position = "relative";
        wrapper.style.zIndex = "10";
        tbEl.insertBefore(wrapper, tbEl.firstChild);
        setContainer(wrapper);
        return true;
      }
      return false;
    }

    if (tryMount()) return;

    const observer = new MutationObserver(() => {
      if (tryMount()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  if (!container) return null;

  return createPortal(<SharedTitlebar />, container);
}
