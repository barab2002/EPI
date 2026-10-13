import { createContext, useContext } from 'react';
import { browserLocale, isRtl, Locale, setLocale } from './i18n';

const KEY = 'epi.locale';

/** Last language chosen on this browser (used before sign-in); storage may be unavailable. */
export function storedLocale(): Locale | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'he' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Activates a language: catalogs, <html lang/dir>, and the browser's memory of the choice. */
export function applyLocale(l: Locale): void {
  setLocale(l);
  document.documentElement.lang = l;
  document.documentElement.dir = isRtl(l) ? 'rtl' : 'ltr';
  try {
    window.localStorage.setItem(KEY, l);
  } catch {
    /* private mode: the choice still applies to this page */
  }
}

export function initialLocale(): Locale {
  return storedLocale() ?? browserLocale();
}

export const LocaleContext = createContext<{ locale: Locale; change: (l: Locale) => void }>({
  locale: 'en',
  change: () => undefined,
});

export const useLocale = () => useContext(LocaleContext);
