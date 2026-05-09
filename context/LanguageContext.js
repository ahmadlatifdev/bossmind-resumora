import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "rs_lang";
const COOKIE_NAME = "rs_lang";

function readCookieLang() {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=(en|fr)(?:;|$)`));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function writeLangCookie(next) {
  if (typeof document === "undefined") return;
  try {
    const secure = typeof location !== "undefined" && location.protocol === "https:";
    document.cookie = `${COOKIE_NAME}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
  } catch {
    /* ignore */
  }
}

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
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === "en" || stored === "fr") {
          setLangState(stored);
        } else {
          const c = readCookieLang();
          if (c === "en" || c === "fr") setLangState(c);
        }
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
    writeLangCookie(next);
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
