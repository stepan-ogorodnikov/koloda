import { Cancel01Icon, CopyIcon, MinusSignIcon, SquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@koloda/ui";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { tv } from "tailwind-variants";

type TitlebarPlatform = "linux" | "macos" | "windows";
type TitlebarAction = "close" | "maximize" | "minimize";

type TitlebarControl = {
  action: TitlebarAction;
  icon: IconSvgElement;
};

const appWindow = getCurrentWindow();
const platform = getTitlebarPlatform();

const titlebar = tv({
  base:
    "flex h-8 w-full shrink-0 items-center border-b-2 border-main bg-body select-none [-webkit-app-region:drag] [-webkit-user-select:none]",
  variants: {
    platform: {
      macos: "justify-start px-3",
      linux: "justify-end pl-3",
      windows: "justify-end pl-3",
    },
  },
});

const titlebarControls = tv({
  variants: {
    platform: {
      macos: "flex items-center gap-2 [-webkit-app-region:no-drag]",
      linux: "flex h-full items-center gap-1 pr-2 [-webkit-app-region:no-drag]",
      windows: "flex h-full items-stretch [-webkit-app-region:no-drag]",
    },
  },
});

const control = tv({
  variants: {
    platform: {
      macos:
        "group size-3.5 min-w-3.5 rounded-full border p-0 text-neutral-950/80 hover:brightness-95 data-pressed:brightness-90",
      linux: "group size-6 min-w-6 rounded-full p-1 fg-level-3 hover:bg-button-hover data-pressed:bg-button-pressed",
      windows: "group h-8 min-w-11 rounded-none p-0 fg-level-3 hover:bg-button-hover data-pressed:bg-button-pressed",
    },
    action: {
      close: "",
      maximize: "",
      minimize: "",
    },
  },
  compoundVariants: [
    { platform: "macos", action: "close", class: "bg-[#ff5f57] border-[#e0443e]" },
    { platform: "macos", action: "maximize", class: "bg-[#28c840] border-[#1dac2d]" },
    { platform: "macos", action: "minimize", class: "bg-[#febc2e] border-[#d89b18]" },
    { platform: "linux", action: "close", class: "hover:bg-red-500 hover:text-white dark:hover:bg-red-600" },
    { platform: "windows", action: "close", class: "hover:bg-red-500 hover:text-white dark:hover:bg-red-600" },
  ],
});

const controlIcon = tv({
  variants: {
    platform: {
      macos: "size-2 min-w-2 opacity-0 group-hover:opacity-70 group-data-focus-visible:opacity-70",
      linux: "size-4 min-w-4",
      windows: "size-4 min-w-4",
    },
    action: {
      close: "",
      maximize: "",
      minimize: "",
    },
  },
  compoundVariants: [
    { platform: "linux", action: "maximize", class: "size-3.5 min-w-3.5 rotate-180" },
    { platform: "windows", action: "maximize", class: "size-3.5 min-w-3.5 rotate-180" },
  ],
});

export function NativeTitlebar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const syncMaximizedState = () => {
      void appWindow.isMaximized()
        .then((value) => {
          if (isMounted) setIsMaximized(value);
        })
        .catch(logWindowControlError);
    };

    syncMaximizedState();

    let unlistenResize: (() => void) | undefined;

    void appWindow.onResized(syncMaximizedState)
      .then((unlisten) => {
        if (isMounted) {
          unlistenResize = unlisten;
        } else {
          unlisten();
        }
      })
      .catch(logWindowControlError);

    return () => {
      isMounted = false;
      unlistenResize?.();
    };
  }, []);

  const controls = getTitlebarControls(isMaximized);

  if (platform === "macos") {
    return (
      <div
        className="h-8 w-full shrink-0 [-webkit-app-region:drag]"
        data-tauri-drag-region
        onDoubleClick={() => runWindowAction("maximize")}
      />
    );
  }

  return (
    <div className={titlebar({ platform })}>
      <div
        className="grow self-stretch"
        data-tauri-drag-region
        onDoubleClick={() => runWindowAction("maximize")}
      />
      <TitlebarControls
        controls={[controls.minimize, controls.maximize, controls.close]}
        onAction={runWindowAction}
      />
    </div>
  );

  function runWindowAction(action: TitlebarAction) {
    void (async () => {
      if (action === "close") {
        await appWindow.close();
        return;
      }

      if (action === "minimize") {
        await appWindow.minimize();
        return;
      }

      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    })().catch(logWindowControlError);
  }
}

type TitlebarControlsProps = {
  controls: TitlebarControl[];
  onAction: (action: TitlebarAction) => void;
};

function TitlebarControls({ controls, onAction }: TitlebarControlsProps) {
  return (
    <div className={titlebarControls({ platform })}>
      {controls.map(({ action, icon }) => (
        <Button
          variants={{ size: "none", class: control({ platform, action }) }}
          onPress={() => onAction(action)}
          excludeFromTabOrder
          key={action}
        >
          <HugeiconsIcon
            aria-hidden="true"
            className={controlIcon({ platform, action })}
            icon={icon}
            strokeWidth={platform === "macos" ? 2.5 : 2}
          />
        </Button>
      ))}
    </div>
  );
}

function getTitlebarPlatform(): TitlebarPlatform {
  const platform = getNavigatorPlatform().toLowerCase();

  if (platform.includes("mac")) return "macos";
  if (platform.includes("win")) return "windows";
  return "linux";
}

function getNavigatorPlatform() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || navigator.userAgent;
}

function getTitlebarControls(isMaximized: boolean): Record<TitlebarAction, TitlebarControl> {
  return {
    close: { action: "close", icon: Cancel01Icon },
    minimize: { action: "minimize", icon: MinusSignIcon },
    maximize: { action: "maximize", icon: isMaximized ? CopyIcon : SquareIcon },
  };
}

function logWindowControlError(error: unknown) {
  console.error("[Window control error]", error);
}
