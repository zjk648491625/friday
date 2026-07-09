// IronHero Language Context — defaults to Chinese, supports English toggle
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type Language = "zh" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (zh: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "zh",
  setLanguage: () => {},
  t: (zh) => zh,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem("ironhero-language");
    if (stored === "en" || stored === "zh") return stored;
    // Default to Chinese
    return "zh";
  });

  const setLanguage = useCallback((lang: Language) => {
    localStorage.setItem("ironhero-language", lang);
    setLanguageState(lang);
  }, []);

  const t = useCallback((zh: string, en: string) => {
    return language === "en" ? en : zh;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
