// IronHero
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import App from "./App";
import "./index.css";
import { LanguageProvider } from "./context/Language";
import { persistor, store } from "./redux/store";

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
