"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type Language,
  type TranslationKey,
  type UnitPreference,
  translations,
} from "@/lib/i18n/translations";

const LANG_KEY = "knox_lang";
const UNIT_KEY = "knox_unit";

interface SettingsContextValue {
  language: Language;
  unit: UnitPreference;
  setLanguage: (lang: Language) => void;
  setUnit: (unit: UnitPreference) => void;
  t: (key: TranslationKey) => string;
  dir: "rtl" | "ltr";
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readStoredLang(): Language {
  if (typeof window === "undefined") return "ur";
  const stored = localStorage.getItem(LANG_KEY);
  return stored === "en" ? "en" : "ur";
}

function readStoredUnit(): UnitPreference {
  if (typeof window === "undefined") return "kW";
  const stored = localStorage.getItem(UNIT_KEY);
  if (stored === "W" || stored === "auto") return stored;
  return "kW";
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ur");
  const [unit, setUnitState] = useState<UnitPreference>("kW");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLanguageState(readStoredLang());
      setUnitState(readStoredUnit());
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const dir: "rtl" | "ltr" = language === "ur" ? "rtl" : "ltr";

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir, ready]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANG_KEY, lang);
  }, []);

  const setUnit = useCallback((pref: UnitPreference) => {
    setUnitState(pref);
    localStorage.setItem(UNIT_KEY, pref);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translations[language][key],
    [language],
  );

  const value = useMemo(
    () => ({ language, unit, setLanguage, setUnit, t, dir }),
    [language, unit, setLanguage, setUnit, t, dir],
  );

  if (!ready) {
    return (
      <div className="connect-mesh flex min-h-dvh flex-1 flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-amber-400/20 border-t-amber-400" />
        <p className="text-sm text-slate-400">{t("checkingConnection")}</p>
      </div>
    );
  }

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
