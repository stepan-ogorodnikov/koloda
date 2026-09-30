import type { IpcMainInvokeEvent } from "electron";
import { appDir, isDev } from "./env";
import { appNavigationTarget, assertAppFrame } from "./navigation-policy";

// WHY: The preload exposes `invoke` for every channel, and a navigation re-runs
// that preload on the new page. Handlers must ignore any frame that is not the app.
export function assertAppSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  const url = frame == null || frame.isDestroyed() ? undefined : frame.url;
  assertAppFrame(url, appNavigationTarget({ isDev, appDir }));
}
