"use client";

import { useEffect, useMemo, useState } from "react";
import GlassCard from "@/components/dashboard/GlassCard";
import { useSettings } from "@/components/SettingsProvider";
import { ENERGY_HISTORY_KEY, readLocal, type EnergyHistoryPoint } from "@/lib/energy-platform";
import { localEnergyInsight, type EnergyInsight, type InsightReading } from "@/lib/ai-insight";
import { parsePowerKw } from "@/lib/solar-forecast";
import type { LiveData } from "@/lib/knox";

const CACHE_MS = 15 * 60_000;
const CACHE_KEY = "knox_gemini_insight_v1";

interface CachedInsight { expiresAt: number; language: "ur" | "en"; signature: string; insight: EnergyInsight; }

function numeric(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AIEnergyInsight({ data }: { data: LiveData }) {
  const { language } = useSettings();
  const reading = useMemo<InsightReading>(() => ({
    pvKw: parsePowerKw(data.pvPower.value, data.pvPower.unit) ?? 0,
    loadKw: parsePowerKw(data.loadPower.value, data.loadPower.unit) ?? 0,
    gridKw: parsePowerKw(data.gridPower.value, data.gridPower.unit) ?? 0,
    temperatureC: numeric(data.temperature.value),
    gridConnected: data.gridConnected,
    statusCode: data.statusCode,
    faultCode: numeric(data.faultCode.value) ?? 0,
    warningCode: numeric(data.warningCode.value) ?? 0,
    todayEnergyKwh: numeric(data.todayEnergy.value),
  }), [data]);
  const fallback = useMemo(() => localEnergyInsight(reading, language), [language, reading]);
  const [resolved, setResolved] = useState<{ language: "ur" | "en"; signature: string; insight: EnergyInsight } | null>(null);
  const [loading, setLoading] = useState(false);
  const temperatureBand = (reading.temperatureC ?? 0) >= 50 ? "hot" : "normal";
  const operatingBand = reading.pvKw >= reading.loadKw + 0.7 ? "surplus" : reading.pvKw < reading.loadKw ? "deficit" : "balanced";
  const signature = `${operatingBand}:${temperatureBand}:${reading.gridConnected}:${reading.faultCode}:${reading.warningCode}`;

  useEffect(() => {
    let cancelled = false;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CachedInsight | null;
      if (cached && cached.expiresAt > Date.now() && cached.language === language && cached.signature === signature) {
        const cachedTimer = window.setTimeout(() => {
          if (!cancelled) setResolved({ language, signature, insight: cached.insight });
        }, 0);
        return () => { cancelled = true; window.clearTimeout(cachedTimer); };
      }
    } catch { /* use fresh analysis */ }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const recent = readLocal<EnergyHistoryPoint[]>(ENERGY_HISTORY_KEY, []).slice(-24);
        const response = await fetch("/api/ai/insight", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language, reading: { ...reading, recent } }),
        });
        if (!response.ok) return;
        const next = await response.json() as EnergyInsight;
        if (cancelled) return;
        setResolved({ language, signature, insight: next });
        localStorage.setItem(CACHE_KEY, JSON.stringify({ expiresAt: Date.now() + CACHE_MS, language, signature, insight: next } satisfies CachedInsight));
      } finally { if (!cancelled) setLoading(false); }
    }, 1200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [fallback, language, reading, signature]);

  const insight = resolved?.language === language && resolved.signature === signature ? resolved.insight : fallback;
  const colors = insight.severity === "warning" ? "text-amber-300 bg-amber-400/10 border-amber-400/20" : insight.severity === "good" ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/20" : "text-sky-300 bg-sky-400/10 border-sky-400/20";
  const sourceLabel = insight.source === "gemini" ? "Gemini" : language === "ur" ? "مقامی تجزیہ" : "Local analysis";
  return <GlassCard className="ai-insight-card relative overflow-hidden">
    <div className="flex items-start gap-4">
      <span className={`ai-orb flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-lg ${colors}`}><span>✦</span></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">{language === "ur" ? "Knox ذہانت" : "Knox Intelligence"}</p><span className="flex items-center gap-1.5 rounded-full border border-violet-300/15 bg-violet-300/[0.07] px-2.5 py-1 text-[10px] font-semibold text-violet-200">{loading ? <span className="h-2.5 w-2.5 animate-spin rounded-full border border-violet-300/30 border-t-violet-300" /> : <span className="h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,.8)]" />}{sourceLabel}</span></div>
        <h2 className="mt-2 text-lg font-semibold text-white">{insight.title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-slate-400">{insight.summary}</p>
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">{language === "ur" ? "بہترین اگلا قدم" : "Best next step"}</p><p className="mt-1.5 text-sm font-medium leading-5 text-slate-200"><span className="me-2 text-violet-300">→</span>{insight.action}</p></div>
      </div>
    </div>
  </GlassCard>;
}
