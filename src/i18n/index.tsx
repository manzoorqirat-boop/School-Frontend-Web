import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getItem, setItem } from '../lib/storage';
import { I18N_TRANSLATIONS, Lang } from './translations';

// Lightweight i18n. Ported from the web I18nProvider: same dictionary, same
// t(key, fallback) contract. Language choice persists across launches.

const LANG_KEY = 'vy_lang';

type I18nState = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
};

const Ctx = createContext<I18nState>({
  lang: 'en',
  setLang: () => {},
  t: (k, f) => f ?? k,
});

export const useI18n = () => useContext(Ctx);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    (async () => {
      try {
        const saved = await getItem(LANG_KEY);
        if (saved === 'en' || saved === 'hi') setLangState(saved);
      } catch {}
    })();
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    setItem(LANG_KEY, l).catch(() => {});
  }, []);

  // t(): current-lang lookup → English fallback → provided fallback → key.
  const t = useCallback((key: string, fallback?: string): string => {
    const table = I18N_TRANSLATIONS[lang] ?? {};
    if (table[key] != null) return table[key];
    const en = I18N_TRANSLATIONS.en ?? {};
    if (en[key] != null) return en[key];
    return fallback ?? key;
  }, [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
