"use client";

import { useEffect, useRef, useState } from "react";
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
          ? "border-emerald-400/35 bg-emerald-400/[0.08] text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.08)]"
          : "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { language, unit, setLanguage, setUnit, t, dir } = useSettings();
  const importRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  const downloadBackup = () => {
    const backup: Record<string, unknown> = { version: 1, exportedAt: new Date().toISOString(), data: {} };
    const data = backup.data as Record<string, string>;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("knox_")) data[key] = localStorage.getItem(key) ?? "";
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `knox-solar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const restoreBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { data?: Record<string, unknown> };
      if (!parsed.data || typeof parsed.data !== "object") throw new Error("Invalid backup");
      for (const [key, value] of Object.entries(parsed.data)) {
        if (key.startsWith("knox_") && typeof value === "string") localStorage.setItem(key, value);
      }
      setBackupStatus(t("restoreDone"));
      window.setTimeout(() => window.location.reload(), 700);
    } catch {
      setBackupStatus(t("error"));
    }
  };

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="app-overlay settings-modal fixed inset-0 z-[90] flex items-center justify-center bg-[#03070d]/80 backdrop-blur-md"
      onClick={onClose}
      role="presentation"
    >
      <div
        dir={dir}
        className="settings-modal-panel flex flex-col overflow-hidden border border-white/[0.08] bg-[#0a111a] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-title"
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0a111a]/95 px-5 py-4 backdrop-blur-xl sm:px-7 sm:py-5">
          <h2 id="settings-title" className="text-xl font-bold text-white">
            {t("settings")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-lg text-slate-400 transition hover:bg-white/[0.08]"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6 pb-[calc(2rem+var(--safe-bottom))] overscroll-contain sm:px-7 sm:py-7">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              {t("language")}
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
              {t("units")}
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

          <fieldset className="border-t border-white/[0.07] pt-6">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">{t("backupData")}</legend>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">{t("backupHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={downloadBackup} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/[0.07]">{t("downloadBackup")}</button>
              <button type="button" onClick={() => importRef.current?.click()} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm font-semibold text-emerald-300">{t("restoreBackup")}</button>
            </div>
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); }} />
            {backupStatus && <p className="mt-3 text-xs text-emerald-300">{backupStatus}</p>}
          </fieldset>
        </div>
      </div>
    </div>
  );
}
