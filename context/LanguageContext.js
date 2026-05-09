import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "rs_lang";

const LanguageContext = createContext({
  lang: "en",
  setLang: () => {},
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const s = window.localStorage.getItem(STORAGE_KEY);
        if (s === "en" || s === "fr") setLangState(s);
      } catch {
        /* ignore */
      }
      setReady(true);
    });
  }, []);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang, ready }), [lang, setLang, ready]);

  useEffect(() => {
    if (!ready || typeof document === "undefined") return;
    document.documentElement.lang = lang === "fr" ? "fr" : "en";
  }, [lang, ready]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
