import { useContext, useEffect } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setToolPolicy } from "../redux/slices/uiSlice";

let _settingsCache: Record<string, any> | null = null;

/** Load settings from ~/.friday/friday-settings.json via core process */
export async function loadSettings(messenger: any): Promise<Record<string, any>> {
  if (_settingsCache) return _settingsCache;
  try {
    const result = await messenger.request("settings/get", undefined);
    _settingsCache = result || {};
    return _settingsCache;
  } catch { return {}; }
}

/** Save settings to ~/.friday/friday-settings.json via core process */
export function saveSettings(messenger: any, settings: Record<string, any>): void {
  _settingsCache = settings;
  messenger.request("settings/save", settings);
}

export function useSettings() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const toolSettings = useAppSelector((state) => state.ui.toolSettings);

  // On mount, restore tool policies and language from file settings
  useEffect(() => {
    loadSettings(ideMessenger).then((settings: any) => {
      if (settings.toolPolicies) {
        for (const [name, policy] of Object.entries(settings.toolPolicies)) {
          dispatch(setToolPolicy({ toolName: name, policy: policy as any }));
        }
      }
      if (settings.language) {
        try { localStorage.setItem("ironhero-language", settings.language); } catch {}
      }
    });
  }, []); // Only on mount

  // When toolSettings change, save to file (debounced)
  useEffect(() => {
    if (Object.keys(toolSettings).length > 0) {
      loadSettings(ideMessenger).then((existing: any) => {
        saveSettings(ideMessenger, {
          ...existing,
          toolPolicies: toolSettings,
        });
      });
    }
  }, [toolSettings]);

  return { saveSetting: (key: string, value: any) => {
    loadSettings(ideMessenger).then((existing: any) => {
      saveSettings(ideMessenger, { ...existing, [key]: value });
    });
  }};
}
