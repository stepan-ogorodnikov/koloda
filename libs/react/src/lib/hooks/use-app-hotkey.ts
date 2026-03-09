import { useHotkeysStatus } from "@koloda/react";
import type { HotkeyEntry } from "@koloda/srs";
import { getHotkeyManager } from "@tanstack/react-hotkeys";
import type { HotkeyCallback, HotkeyOptions, HotkeyRegistrationHandle } from "@tanstack/react-hotkeys";
import { useEffect, useEffectEvent, useRef } from "react";

export function useAppHotkey(
  hotkeys: HotkeyEntry,
  callback: HotkeyCallback,
  scope: string,
  options?: HotkeyOptions,
) {
  const hotkeyManager = getHotkeyManager();
  const { scopes } = useHotkeysStatus();
  const handles = useRef<HotkeyRegistrationHandle[]>([]);

  const onHotkeysChange = useEffectEvent((updated: HotkeyEntry) => {
    handles.current.forEach((handle) => handle.unregister());
    handles.current = updated.map((hotkey) => (
      hotkeyManager.register(hotkey, callback, getOptions(options, scope, scopes))
    ));
  });

  const onCallbackChange = useEffectEvent((updated: HotkeyCallback) => {
    handles.current.forEach((handle) => handle.callback = updated);
  });

  const onOptionsChange = useEffectEvent((updated?: HotkeyOptions) => {
    setHandlesOptions(handles.current, updated, scope, scopes);
  });

  const onScopeChange = useEffectEvent((updated: string) => {
    setHandlesOptions(handles.current, options, updated, scopes);
  });

  const onScopesChange = useEffectEvent((updated: Record<string, boolean>) => {
    setHandlesOptions(handles.current, options, scope, updated);
  });

  useEffect(() => {
    onHotkeysChange(hotkeys);
  }, [hotkeys]);

  useEffect(() => {
    onCallbackChange(callback);
  }, [callback]);

  useEffect(() => {
    onOptionsChange(options);
  }, [options]);

  useEffect(() => {
    onScopeChange(scope);
  }, [scope]);

  useEffect(() => {
    onScopesChange(scopes);
  }, [scopes]);

  useEffect(() => {
    return () => {
      handles.current.forEach((handle) => {
        handle.unregister();
      });
      handles.current = [];
    };
  }, []);

  return null;
}

function setHandlesOptions(
  handles: HotkeyRegistrationHandle[],
  options: HotkeyOptions | undefined,
  scope: string,
  scopes: Record<string, boolean>,
) {
  const value = getOptions(options, scope, scopes);
  handles.forEach((handle) => handle.setOptions(value));
}

function getOptions(
  options: HotkeyOptions | undefined,
  scope: string,
  scopes: Record<string, boolean>,
) {
  return { ...options, enabled: !scope || !!scopes[scope] };
}
