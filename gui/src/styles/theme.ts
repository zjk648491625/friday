// All vscode variables https://gist.github.com/estruyf/ba49203e1a7d6868e9320a4ea480c27a
// Examples for vscode https://github.com/githubocto/tailwind-vscode/blob/main/index.js

// The current default theme is dark with blue accents
export const THEME_COLORS = {
  background: {
    vars: [
      "--vscode-sideBar-background",
      "--vscode-editor-background",
      "--vscode-panel-background",
    ],
    default: "#1e1e1e", // dark gray
  },
  foreground: {
    vars: [
      "--vscode-sideBar-foreground",
      "--vscode-editor-foreground",
      "--vscode-panel-foreground",
    ],
    default: "#e6e6e6", // light gray
  },
  "editor-background": {
    vars: ["--vscode-editor-background"],
    default: "#1e1e1e", // dark gray
  },
  "editor-foreground": {
    vars: ["--vscode-editor-foreground"],
    default: "#e6e6e6", // light gray
  },
  "primary-background": {
    vars: ["--vscode-button-background"],
    default: "#2c5aa0", // medium blue
  },
  "primary-foreground": {
    vars: ["--vscode-button-foreground"],
    default: "#ffffff", // white
  },
  "primary-hover": {
    vars: ["--vscode-button-hoverBackground"],
    default: "#3a6db3", // lighter blue
  },
  "secondary-background": {
    vars: ["--vscode-button-secondaryBackground"],
    default: "#303030", // medium dark gray
  },
  "secondary-foreground": {
    vars: ["--vscode-button-secondaryForeground"],
    default: "#e6e6e6", // light gray
  },
  "secondary-hover": {
    vars: ["--vscode-button-secondaryHoverBackground"],
    default: "#3a3a3a", // medium gray
  },
  border: {
    vars: ["--vscode-sideBar-border", "--vscode-panel-border"],
    default: "#2a2a2a", // dark gray border
  },
  "border-focus": {
    vars: ["--vscode-focusBorder"],
    default: "#3a6db3", // lighter blue
  },
  // Command styles are used for tip-tap editor
  "command-background": {
    vars: ["--vscode-commandCenter-background"],
    default: "#252525", // dark gray
  },
  "command-foreground": {
    vars: ["--vscode-commandCenter-foreground"],
    default: "#e6e6e6", // light gray
  },
  "command-border": {
    vars: ["--vscode-commandCenter-inactiveBorder"],
    default: "#555555", // medium gray
  },
  "command-border-focus": {
    vars: ["--vscode-commandCenter-activeBorder"],
    default: "#4d8bf0", // bright blue
  },
  description: {
    vars: ["--vscode-descriptionForeground"],
    default: "#b3b3b3", // medium light gray
  },
  "description-muted": {
    vars: ["--vscode-list-deemphasizedForeground"],
    default: "#8c8c8c", // medium gray
  },
  "input-background": {
    vars: ["--vscode-input-background"],
    default: "#2d2d2d", // dark gray
  },
  "input-foreground": {
    vars: ["--vscode-input-foreground"],
    default: "#e6e6e6", // light gray
  },
  "input-border": {
    vars: [
      "--vscode-input-border",
      "--vscode-commandCenter-inactiveBorder",
      "vscode-border",
    ],
    default: "#555555", // medium gray
  },
  "input-placeholder": {
    vars: ["--vscode-input-placeholderForeground"],
    default: "#9e9e9e", // medium light gray
  },
  "table-oddRow": {
    vars: ["--vscode-tree-tableOddRowsBackground"],
    default: "#2d2d2d", // dark gray
  },
  "badge-background": {
    vars: ["--vscode-badge-background"],
    default: "#4d4d4d", // medium dark gray
  },
  "badge-foreground": {
    vars: ["--vscode-badge-foreground"],
    default: "#ffffff", // white
  },
  info: {
    vars: [
      "--vscode-charts-blue",
      "--vscode-notebookStatusRunningIcon-foreground",
    ],
    default: "#2196f3", // blue
  },
  success: {
    vars: [
      "--vscode-notebookStatusSuccessIcon-foreground",
      "--vscode-testing-iconPassed",
      "--vscode-gitDecoration-addedResourceForeground",
      "--vscode-charts-green",
    ],
    default: "#4caf50", // green
  },
  warning: {
    vars: [
      "--vscode-editorWarning-foreground",
      "--vscode-list-warningForeground",
    ],
    default: "#ffb74d", // amber/yellow
  },
  error: {
    vars: ["--vscode-editorError-foreground", "--vscode-list-errorForeground"],
    default: "#f44336", // red
  },
  link: {
    vars: ["--vscode-textLink-foreground"],
    default: "#5c9ce6", // medium blue
  },
  terminal: {
    vars: ["--vscode-terminal-ansiGreen"],
    default: "#0dbc79", // green
  },
  textCodeBlockBackground: {
    vars: ["--vscode-textCodeBlock-background"],
    default: "#1e1e1e", // same as editor-background
  },
  accent: {
    vars: ["--vscode-tab-activeBorderTop", "--vscode-focusBorder"],
    default: "#4d8bf0", // bright blue
  },
  "find-match": {
    vars: ["--vscode-editor-findMatchBackground"], // Can't get "var(--vscode-editor-findMatchBackground, rgba(237, 18, 146, 0.5))" to work
    default: "#264f7840", // translucent blue
  },
  "find-match-selected": {
    vars: ["--vscode-editor-findMatchHighlightBackground"],
    default: "#ffb74d40", // translucent amber
  },
  "list-hover": {
    // --vscode-tab-hoverBackground
    vars: ["--vscode-list-hoverBackground"],
    default: "#383838", // medium dark gray
  },
  "list-active": {
    vars: ["--vscode-list-activeSelectionBackground"],
    default: "#2c5aa050", // translucent medium blue
  },
  "list-active-foreground": {
    vars: ["--vscode-list-activeSelectionForeground"],
    default: "#ffffff", // white
  },
};

// Light theme default color values (for "light" mode and "follow-system" when system is light)
export const THEME_LIGHT_DEFAULTS: Record<string, string> = {
  background: "#f3f3f3",
  foreground: "#1e1e1e",
  "editor-background": "#ffffff",
  "editor-foreground": "#1e1e1e",
  "primary-background": "#0078d4",
  "primary-foreground": "#ffffff",
  "primary-hover": "#1e8ae8",
  "secondary-background": "#e8e8e8",
  "secondary-foreground": "#1e1e1e",
  "secondary-hover": "#dcdcdc",
  border: "#e0e0e0",
  "border-focus": "#0078d4",
  "command-background": "#f6f6f6",
  "command-foreground": "#1e1e1e",
  "command-border": "#cccccc",
  "command-border-focus": "#0078d4",
  description: "#666666",
  "description-muted": "#999999",
  "input-background": "#ffffff",
  "input-foreground": "#1e1e1e",
  "input-border": "#cccccc",
  "input-placeholder": "#9e9e9e",
  "table-oddRow": "#f7f7f7",
  "badge-background": "#e8e8e8",
  "badge-foreground": "#333333",
  info: "#2196f3",
  success: "#4caf50",
  warning: "#ffb74d",
  error: "#f44336",
  link: "#0078d4",
  terminal: "#0dbc79",
  textCodeBlockBackground: "#f5f5f5",
  accent: "#0078d4",
  "find-match": "#264f7840",
  "find-match-selected": "#ffb74d40",
  "list-hover": "#f0f0f0",
  "list-active": "#0078d420",
  "list-active-foreground": "#1e1e1e",
};

export type ThemeMode = "follow-ide" | "follow-system" | "dark" | "light";

/** Apply light or dark default values to CSS variables */
function _applyDefaultSet(defaults: Record<string, string>, isDark: boolean) {
  for (const [colorName, colorVal] of Object.entries(defaults)) {
    const settings = THEME_COLORS[colorName as keyof typeof THEME_COLORS];
    if (!settings) continue;
    for (const cssVar of settings.vars) {
      document.documentElement.style.setProperty(cssVar, colorVal);
      document.body.style.setProperty(cssVar, colorVal);
    }
  }
  document.documentElement.setAttribute("data-color-mode", isDark ? "dark" : "light");
  document.body.setAttribute("data-color-mode", isDark ? "dark" : "light");
}

/** Apply a theme mode by overriding CSS variables on the document. */
export function applyThemeMode(mode: ThemeMode) {
  if (mode === "follow-ide") {
    for (const [colorName, settings] of Object.entries(THEME_COLORS)) {
      for (const cssVar of settings.vars) {
        document.documentElement.style.removeProperty(cssVar);
        document.body.style.removeProperty(cssVar);
      }
    }
    const cachedKeys = Object.keys(THEME_COLORS) as (keyof typeof THEME_COLORS)[];
    for (const colorName of cachedKeys) {
      const cached = localStorage.getItem(colorName);
      if (cached) {
        for (const cssVar of THEME_COLORS[colorName].vars) {
          document.documentElement.style.setProperty(cssVar, cached);
          document.body.style.setProperty(cssVar, cached);
        }
      }
    }
    document.documentElement.removeAttribute("data-color-mode");
    document.body.removeAttribute("data-color-mode");
    return;
  }
  if (mode === "dark") {
    _applyDefaultSet(THEME_DEFAULTS, true);
  } else if (mode === "light") {
    _applyDefaultSet(THEME_LIGHT_DEFAULTS, false);
  } else {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    _applyDefaultSet(isDark ? THEME_DEFAULTS : THEME_LIGHT_DEFAULTS, isDark);
  }
}

/** Listen to system color scheme changes when in follow-system mode. */
export function listenToSystemTheme(onChange: (isDark: boolean) => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

// TODO: add fonts - GUI fonts in jetbrains differ from IDE:
// --vscode-editor-font-family;
// --vscode-font-family;
export const THEME_CSS_VARS = Object.values(THEME_COLORS)
  .map((value) => value.vars)
  .flat();

export const THEME_CSS_VAR_DEFAULTS = Object.entries(THEME_COLORS).reduce(
  (acc, [_, value]) => {
    value.vars.forEach((varName) => {
      acc[varName] = value.default;
    });
    return acc;
  },
  {} as Record<string, string>,
);

export const THEME_DEFAULTS = Object.entries(THEME_COLORS).reduce(
  (acc, [key, value]) => {
    acc[key] = value.default;
    return acc;
  },
  {} as Record<string, string>,
);

// Generates recursive CSS variable fallback for a given color name
// e.g. var(--vscode-button-background, var(--vscode-button-foreground, #ffffff))
export const getRecursiveVar = (vars: string[], defaultColor: string) => {
  return [...vars].reverse().reduce((curr, varName) => {
    return `var(${varName}, ${curr})`;
  }, defaultColor);
};

export const varWithFallback = (colorName: keyof typeof THEME_COLORS) => {
  const themeVals = THEME_COLORS[colorName];
  if (!themeVals) {
    throw new Error(`Invalid theme color name ${colorName}`);
  }
  return getRecursiveVar(themeVals.vars, themeVals.default);
};

export const setDocumentStylesFromTheme = (
  theme: Record<string, string | undefined | null>,
) => {
  // Check for extraneous theme items
  Object.entries(theme).forEach(([colorName, value]) => {
    const themeVals = THEME_COLORS[colorName as keyof typeof THEME_COLORS];
    if (!themeVals) {
      console.warn(
        `Receieved theme color ${colorName} which is not used by the theme`,
      );
      return;
    }
  });

  // Write theme values to document
  const missingColors: string[] = [];
  Object.entries(THEME_COLORS).forEach(([colorName, settings]) => {
    let colorVal = settings.default;
    const newColor = theme[colorName];
    if (newColor) {
      colorVal = newColor;
      // Remove alpha channel from all hex colors (seems to cause bad colors)
      if (newColor.startsWith("#") && newColor.length > 7) {
        colorVal = colorVal.slice(0, 7);
      }
    } else {
      missingColors.push(colorName);
    }

    localStorage.setItem(colorName, colorVal);
    for (const cssVar of settings.vars) {
      document.body.style.setProperty(cssVar, colorVal);
      document.documentElement.style.setProperty(cssVar, colorVal);
    }
  });

  // If a forced theme mode is active (dark/light/follow-system), re-apply its overrides
  try {
    const storedMode = localStorage.getItem("friday-theme-mode") as ThemeMode | null;
    if (storedMode && storedMode !== "follow-ide") {
      if (storedMode === "follow-system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        _applyDefaultSet(isDark ? THEME_DEFAULTS : THEME_LIGHT_DEFAULTS, isDark);
      } else if (storedMode === "dark") {
        _applyDefaultSet(THEME_DEFAULTS, true);
      } else if (storedMode === "light") {
        _applyDefaultSet(THEME_LIGHT_DEFAULTS, false);
      }
    }
  } catch {}

  return missingColors;
};

export const setDocumentStylesFromLocalStorage = (checkCache: boolean) => {
  for (const [colorName, themeVals] of Object.entries(THEME_COLORS)) {
    for (const cssVar of themeVals.vars) {
      // Get cached values (for non-vscode IDEs)
      if (checkCache) {
        const cached = localStorage.getItem(colorName);
        if (cached) {
          document.body.style.setProperty(cssVar, cached);
        }
      }
    }
  }
};

export const clearThemeLocalCache = () => {
  for (const colorName of Object.keys(THEME_COLORS)) {
    localStorage.removeItem(colorName);
  }
};
