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
    // `request` returns a wrapped response `{ done, content, status }`; the
    // actual settings object lives in `content`. Previously we cached the whole
    // wrapper, which got written back into the file and nested infinitely.
    const settings = ((result && result.content) || {}) as Record<string, any>;
    _settingsCache = settings;
    return settings;
  } catch { return {}; }
}

/** Unwrap a legacy `{ done, content }` wrapper if present, so we never write a
 *  nested payload back into the settings file. */
function unwrapSettings(obj: any): any {
  let cur = obj;
  while (
    cur &&
    typeof cur === "object" &&
    cur.done === true &&
    cur.content !== undefined
  ) {
    cur = cur.content;
  }
  return cur;
}

/** Save settings to ~/.friday/friday-settings.json via core process */
export function saveSettings(messenger: any, settings: Record<string, any>): void {
  const clean = unwrapSettings(settings);
  _settingsCache = clean;
  messenger.request("settings/save", clean);
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
