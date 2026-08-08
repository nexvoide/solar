"use client";

import { useSettings } from "@/components/SettingsProvider";
import type { Language, UnitPreference } from "@/lib/i18n/translations";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

function OptionButton({
  active,
  onClick,
  children,
  align = "center",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-4 text-base font-semibold transition ${
        align === "start" ? "text-start" : "text-center"
      } ${
        active
          ? "border-amber-400/50 bg-amber-400/10 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.12)]"
          : "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { language, unit, setLanguage, setUnit, t, dir } = useSettings();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        dir={dir}
        className="glass w-full max-w-md rounded-b-none rounded-t-3xl p-6 sm:rounded-3xl sm:p-8"
        style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-title"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="settings-title" className="text-xl font-bold text-white">
            ⚙️ {t("settings")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/[0.08] px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/12"
          >
            {t("close")}
          </button>
        </div>

        <div className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              🌐 {t("language")}
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <OptionButton
                active={language === "ur"}
                onClick={() => setLanguage("ur" as Language)}
              >
                {t("langUrdu")}
              </OptionButton>
              <OptionButton
                active={language === "en"}
                onClick={() => setLanguage("en" as Language)}
              >
                {t("langEnglish")}
              </OptionButton>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              ⚡ {t("units")}
            </legend>
            <div className="grid gap-3">
              {(
                [
                  ["kW", t("unitKW")],
                  ["W", t("unitW")],
                  ["auto", t("unitAuto")],
                ] as const
              ).map(([code, label]) => (
                <OptionButton
                  key={code}
                  active={unit === code}
                  onClick={() => setUnit(code as UnitPreference)}
                  align="start"
                >
                  {label}
                </OptionButton>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
