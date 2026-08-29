import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getLang, setLang as persistLang } from '../lib/i18n.js';

export type AppLang = 'en' | 'fr' | 'es';

type LangContextValue = {
  lang: AppLang;
  switchLang: (next: AppLang | string) => void;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(() => (getLang() as AppLang) || 'en');

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      switchLang(next) {
        const code = persistLang(next) as AppLang;
        setLangState(code || 'en');
      },
    }),
    [lang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error('useLang must be used within LangProvider (Layout)');
  }
  return ctx;
}

/** Safe for pages that may render outside Layout during migration. */
export function useLangOptional(): LangContextValue {
  const ctx = useContext(LangContext);
  const [lang, setLangState] = useState<AppLang>(() => (getLang() as AppLang) || 'en');
  if (ctx) return ctx;
  return {
    lang,
    switchLang(next) {
      const code = persistLang(next) as AppLang;
      setLangState(code || 'en');
    },
  };
}
