"use client";

import { useSettings } from "@/components/SettingsProvider";
import { formatPower } from "@/lib/formatPower";
import type { FieldReading } from "@/lib/knox";

interface EnergyFlowDiagramProps {
  pvPower: FieldReading;
  loadPower: FieldReading;
  gridConnected: boolean;
  isGenerating: boolean;
  refreshing?: boolean;
}

export default function EnergyFlowDiagram({
  pvPower,
  loadPower,
  gridConnected,
  isGenerating,
  refreshing = false,
}: EnergyFlowDiagramProps) {
  const { t, unit } = useSettings();

  const pvDisplay = formatPower(pvPower.value, pvPower.unit, unit);
  const loadDisplay = formatPower(loadPower.value, loadPower.unit, unit);
  const gridLabel = gridConnected ? t("gridConnected") : t("offline");

  return (
    <div
      className={`glass relative overflow-hidden p-5 sm:p-8 ${refreshing ? "glass-refreshing" : ""}`}
    >
      {/* Soft glow when generating */}
      {isGenerating && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 50% 20%, rgba(251,191,36,0.2), transparent 60%)",
          }}
        />
      )}

      <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {t("energyFlow")}
      </p>

      <div className="relative mx-auto max-w-sm">
        {/* SVG connections */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 320 280"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <path
            d="M 160 72 L 160 118"
            fill="none"
            stroke={isGenerating ? "#fbbf24" : "#334155"}
            strokeWidth="2"
            className={isGenerating ? "flow-path" : ""}
            opacity={isGenerating ? 0.8 : 0.4}
          />
          <path
            d="M 160 158 L 90 210"
            fill="none"
            stroke={isGenerating ? "#38bdf8" : "#334155"}
            strokeWidth="2"
            className={isGenerating ? "flow-path" : ""}
            opacity={isGenerating ? 0.7 : 0.35}
          />
          <path
            d="M 160 158 L 230 210"
            fill="none"
            stroke={isGenerating ? "#a78bfa" : "#334155"}
            strokeWidth="2"
            className={isGenerating ? "flow-path" : ""}
            opacity={isGenerating ? 0.7 : 0.35}
          />
        </svg>

        <div className="relative flex flex-col items-center gap-0">
          {/* Solar node */}
          <div
            className={`flow-node flex w-full max-w-[200px] flex-col items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 ${
              isGenerating ? "flow-node-active" : ""
            }`}
          >
            <span className="text-3xl">☀️</span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-400/90">
              {t("solarProduction")}
            </span>
            <span className="mt-1 text-2xl font-bold tabular-nums text-amber-200">{pvDisplay}</span>
          </div>

          <div className="flex h-10 flex-col items-center justify-center">
            <div className="h-6 w-px bg-gradient-to-b from-amber-500/50 to-emerald-500/50" />
          </div>

          {/* Inverter node */}
          <div className="flex flex-col items-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-8 py-3">
            <span className="text-2xl">⚡</span>
            <span className="text-xs font-semibold text-emerald-300">{t("inverter")}</span>
          </div>

          <div className="h-8" />

          {/* Home + Grid */}
          <div className="grid w-full grid-cols-2 gap-3">
            <div className="flex flex-col items-center rounded-2xl border border-sky-500/20 bg-sky-500/10 px-3 py-4 text-center">
              <span className="text-2xl">🏠</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-sky-400/80">
                {t("homeConsumption")}
              </span>
              <span className="mt-1 text-lg font-bold tabular-nums text-sky-200">{loadDisplay}</span>
            </div>
            <div className="flex flex-col items-center rounded-2xl border border-violet-500/20 bg-violet-500/10 px-3 py-4 text-center">
              <span className="text-2xl">🔌</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-violet-400/80">
                {t("grid")}
              </span>
              <span className="mt-1 text-sm font-bold text-violet-200">{gridLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
