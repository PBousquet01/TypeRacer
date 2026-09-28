"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { en, type Dictionary } from "./en";
import { DICTIONARIES } from "./dictionaries";
import type { Lang } from "../types";

const LANG_COOKIE = "chocobo-lang";

interface I18n {
  lang: Lang;
  t: Dictionary;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18n>({ lang: "en", t: en, setLang: () => {} });

// UX-5. The server picks the starting language (cookie, then the browser's
// Accept-Language) so the first paint is already in the right language; the
// button then switches it here and remembers it in the cookie.
export function LanguageProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.title = DICTIONARIES[next].meta.title;
  }, []);

  const value = useMemo(() => ({ lang, t: DICTIONARIES[lang], setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** The dictionary for the current language. */
export function useT() {
  return useContext(I18nContext).t;
}
