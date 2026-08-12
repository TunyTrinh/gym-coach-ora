import React, { createContext, useContext, useEffect, useState } from "react";
import { LanguageCode, translations, getStoredLanguage, setStoredLanguage } from "./i18n";

export type TranslationKey = keyof typeof translations.en;
export type TranslationParams = Record<string, string | number>;

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key, params) => interpolate(translations.en[key] || key, params),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLangState] = useState<LanguageCode>("en");

  useEffect(() => {
    getStoredLanguage().then((stored) => {
      setLangState(stored);
    });
  }, []);

  const setLanguage = async (newLang: LanguageCode) => {
    setLangState(newLang);
    await setStoredLanguage(newLang);
  };

  const t = (key: TranslationKey, params?: TranslationParams): string => {
    const dict = translations[language] || translations.en;
    return interpolate(dict[key] || translations.en[key] || String(key), params);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

function interpolate(value: string, params?: TranslationParams): string {
  if (!params) return value;
  return value.replace(/\\{(\\w+)\\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function useLanguage() {
  return useContext(LanguageContext);
}
