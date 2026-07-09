// IronHero
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import App from "./App";
import "./index.css";
import { LanguageProvider } from "./context/Language";
import { persistor, store } from "./redux/store";

// ── Global DevTools trigger (runs before React, guaranteed to work in JCEF) ──
(function setupDevTools() {
  let devtoolsMenuEl: HTMLDivElement | null = null;

  function openDevTools(e?: Event) {
    e?.preventDefault();
    // Use postIntellijMessage directly (available in JCEF webview)
    if ((window as any).postIntellijMessage) {
      (window as any).postIntellijMessage("toggleDevTools", undefined, crypto.randomUUID());
    } else {
      // Fallback: try vscode postMessage
      try {
        (window as any).postMessage({ messageType: "toggleDevTools", data: undefined, messageId: "" }, "*");
      } catch (_) {}
    }
    if (devtoolsMenuEl) {
      devtoolsMenuEl.remove();
      devtoolsMenuEl = null;
    }
  }

  function hideMenu() {
    if (devtoolsMenuEl) {
      devtoolsMenuEl.remove();
      devtoolsMenuEl = null;
    }
  }

  function showDevToolsMenu(x: number, y: number) {
    hideMenu();

    const style = document.createElement("style");
    style.textContent = `
      #friday-devtools-menu{position:fixed;z-index:99999;background:var(--vscode-editor-background,#1e1e1e);border:1px solid #555;border-radius:6px;padding:4px 0;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-size:13px;color:var(--vscode-foreground,#ccc)}
      #friday-devtools-menu div{padding:6px 16px;cursor:pointer}
      #friday-devtools-menu div:hover{background:var(--vscode-list-hoverBackground,rgba(79,70,229,0.15))}
    `;
    document.head.appendChild(style);

    devtoolsMenuEl = document.createElement("div");
    devtoolsMenuEl.id = "friday-devtools-menu";

    // Position towards center from edge
    const toRight = x > window.innerWidth / 2;
    const toBottom = y > window.innerHeight / 2;
    devtoolsMenuEl.style[toRight ? "right" : "left"] = toRight
      ? `${window.innerWidth - x}px`
      : `${x}px`;
    devtoolsMenuEl.style[toBottom ? "bottom" : "top"] = toBottom
      ? `${window.innerHeight - y}px`
      : `${y}px`;

    const devToolsItem = document.createElement("div");
    devToolsItem.textContent = "🔧 Open Dev Tools  (Ctrl+Shift+I)";
    devToolsItem.onclick = () => openDevTools();

    const copyItem = document.createElement("div");
    const sel = window.getSelection()?.toString();
    if (sel) {
      copyItem.textContent = "📋 Copy";
      copyItem.onclick = () => {
        navigator.clipboard.writeText(sel).catch(() => document.execCommand("copy"));
        hideMenu();
      };
    }

    devtoolsMenuEl.appendChild(devToolsItem);
    if (sel) devtoolsMenuEl.appendChild(copyItem);
    document.body.appendChild(devtoolsMenuEl);
  }

  // Intercept right-click: prevent native menu, show custom menu
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showDevToolsMenu(e.clientX, e.clientY);
  }, true); // capture phase to beat JCEF native handler

  // Close menu on click elsewhere
  window.addEventListener("click", hideMenu, true);

  // Keyboard shortcut: Ctrl+Shift+I
  window.addEventListener("keydown", (e) => {
    if (e.key === "I" && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      openDevTools();
    }
  }, true); // capture phase
})();

(async () => {
  const container = document.getElementById("root") as HTMLElement;
  const root = ReactDOM.createRoot(container);

  root.render(
    <React.StrictMode>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </PersistGate>
      </Provider>
    </React.StrictMode>,
  );
})();
