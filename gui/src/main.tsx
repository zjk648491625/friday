// IronHero
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import App from "./App";
import "./index.css";
import { LanguageProvider } from "./context/Language";
import { persistor, store } from "./redux/store";

// ── Global DevTools & clipboard helpers (runs before React, JCEF-safe) ──
(function setupDevTools() {
  let devtoolsMenuEl: HTMLDivElement | null = null;

  function postToIde(messageType: string, data?: any) {
    // Use the JBCefJSQuery bridge injected by FridayBrowser.kt
    if ((window as any).postIntellijMessage) {
      (window as any).postIntellijMessage(messageType, data, "");
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

    const toRight = x > window.innerWidth / 2;
    const toBottom = y > window.innerHeight / 2;
    devtoolsMenuEl.style[toRight ? "right" : "left"] = toRight
      ? `${window.innerWidth - x}px`
      : `${x}px`;
    devtoolsMenuEl.style[toBottom ? "bottom" : "top"] = toBottom
      ? `${window.innerHeight - y}px`
      : `${y}px`;

    const devToolsItem = document.createElement("div");
    devToolsItem.textContent = "\uD83D\uDD27 Open Dev Tools  (Ctrl+Shift+I)";
    devToolsItem.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      postToIde("toggleDevTools");
      hideMenu();
    };
    devtoolsMenuEl.appendChild(devToolsItem);

    // Copy selected text — use execCommand which works in JCEF
    const sel = window.getSelection()?.toString();
    if (sel) {
      const copyItem = document.createElement("div");
      copyItem.textContent = "\uD83D\uDCCB Copy";
      copyItem.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        document.execCommand("copy");
        hideMenu();
      };
      devtoolsMenuEl.appendChild(copyItem);
    }

    document.body.appendChild(devtoolsMenuEl);
  }

  // Only intercept contextmenu on the document root (not inside editable/inputs)
  window.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement;
    // Don't intercept inside ProseMirror (TipTap editor) or any input/textarea
    if (
      target.closest?.(".ProseMirror") ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return; // let native behavior handle it (paste, etc.)
    }
    e.preventDefault();
    e.stopPropagation();
    showDevToolsMenu(e.clientX, e.clientY);
  });

  // Close menu on click elsewhere
  window.addEventListener("click", (e) => {
    if (devtoolsMenuEl && !devtoolsMenuEl.contains(e.target as Node)) {
      hideMenu();
    }
  });

  // Keyboard shortcut: Ctrl+Shift+I → open DevTools
  window.addEventListener("keydown", (e) => {
    if (e.key === "I" && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      postToIde("toggleDevTools");
    }
  });
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
