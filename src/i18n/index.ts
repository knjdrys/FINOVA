/**
 * FINOVA i18n — React layer. Re-exports the framework-free core (import domain code
 * from './core' to avoid pulling React into the domain) and adds the provider/hook
 * that keeps the module singleton in sync with app state and triggers re-renders.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { Lang, setLanguage, t as coreT } from './core';

export * from './core';

interface I18nValue {
  lang: Lang;
  t: typeof coreT;
}

const I18nContext = createContext<I18nValue>({ lang: 'en', t: coreT });

/** Wrap the app root; syncs the module singleton so engines localize consistently. */
export function I18nProvider(props: { lang: Lang; children: React.ReactNode }): React.ReactElement {
  setLanguage(props.lang);
  const value = useMemo<I18nValue>(() => ({ lang: props.lang, t: coreT }), [props.lang]);
  return React.createElement(I18nContext.Provider, { value }, props.children);
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
