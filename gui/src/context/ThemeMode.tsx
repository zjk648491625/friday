import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  applyThemeMode,
  listenToSystemTheme,
  THEME_DEFAULTS,
  THEME_LIGHT_DEFAULTS,
  THEME_COLORS,
  ThemeMode,
} from "../styles/theme";

interface ThemeModeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextType>({
  themeMode: "follow-ide",
  setThemeMode: () => {},
});

const THEME_MODE_KEY = "friday-theme-mode";

function getStoredThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_MODE_KEY);
    if (
      stored === "follow-ide" ||
      stored === "follow-system" ||
      stored === "dark" ||
      stored === "light"
    ) {
      return stored;
    }
  } catch {}
  return "follow-ide";
}

function storeThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {}
}

function applySystemThemeOverride(isDark: boolean) {
  const defaults = isDark ? THEME_DEFAULTS : THEME_LIGHT_DEFAULTS;
  for (const [colorName, colorVal] of Object.entries(defaults)) {
    const settings = THEME_COLORS[colorName as keyof typeof THEME_COLORS];
    if (!settings) continue;
    for (const cssVar of settings.vars) {
      document.documentElement.style.setProperty(cssVar, colorVal);
      document.body.style.setProperty(cssVar, colorVal);
    }
  }
  document.documentElement.setAttribute(
    "data-color-mode",
    isDark ? "dark" : "light",
  );
  document.body.setAttribute("data-color-mode", isDark ? "dark" : "light");
}

export function ThemeModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(
    getStoredThemeMode,
  );
  const systemListenerRef = useRef<(() => void) | null>(null);

  const applyMode = useCallback((mode: ThemeMode) => {
    if (systemListenerRef.current) {
      systemListenerRef.current();
      systemListenerRef.current = null;
    }

    if (mode === "follow-system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      applySystemThemeOverride(isDark);
      systemListenerRef.current = listenToSystemTheme((isDark) => {
        applySystemThemeOverride(isDark);
      });
    } else {
      applyThemeMode(mode);
    }
  }, []);

  useEffect(() => {
    applyMode(themeMode);
    return () => {
      if (systemListenerRef.current) {
        systemListenerRef.current();
      }
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    storeThemeMode(mode);
    applyMode(mode);
  }, [applyMode]);

  return (
    <ThemeModeContext.Provider value={{ themeMode, setThemeMode }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeModeContext);
}
