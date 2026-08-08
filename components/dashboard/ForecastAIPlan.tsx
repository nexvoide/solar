"use client";

import { useEffect, useMemo, useState } from "react";
import GlassCard from "@/components/dashboard/GlassCard";
import type { Appliance, ForecastHour } from "@/lib/solar-forecast";

interface ForecastPlanItem { time: string; task: string; reason: string; }
interface ForecastPlan {
  briefing: string;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  plan: ForecastPlanItem[];
  source: "gemini" | "local";
}

interface CachedPlan { expiresAt: number; signature: string; result: ForecastPlan; }

const CACHE_KEY = "knox_gemini_forecast_plan_v1";
const CACHE_MS = 60 * 60_000;

function hourLabel(time: string, language: "ur" | "en"): string {
  return new Intl.DateTimeFormat(language === "ur" ? "ur-PK" : "en-PK", { hour: "numeric", minute: "2-digit" }).format(new Date(time));
}

function localPlan(hours: ForecastHour[], loadKw: number, language: "ur" | "en"): ForecastPlan {
  const ur = language === "ur";
  const useful = hours.filter((hour) => hour.outputKw > loadKw + 0.3);
  const peak = hours.reduce<ForecastHour | null>((best, hour) => !best || hour.outputKw > best.outputKw ? hour : best, null);
  const weatherRisk = hours.some((hour) => hour.precipitationProbability >= 60 || hour.cloudCover >= 80);
  const windowStart = useful[0];
  const windowEnd = useful.at(-1);
  const briefing = peak
    ? ur
      ? `آج سب سے زیادہ سولر تقریباً ${peak.outputKw.toFixed(1)} kW، ${hourLabel(peak.time, language)} کے قریب متوقع ہے۔`
      : `Today’s solar peak is about ${peak.outputKw.toFixed(1)} kW near ${hourLabel(peak.time, language)}.`
    : ur ? "آج قابل استعمال سولر پیشگوئی دستیاب نہیں۔" : "No usable solar forecast is available today.";
  const plan: ForecastPlanItem[] = [];
  if (windowStart && windowEnd) plan.push({
    time: `${hourLabel(windowStart.time, language)}–${hourLabel(windowEnd.time, language)}`,
    task: ur ? "زیادہ بجلی والے آلات" : "Heavy appliances",
    reason: ur ? "اس دوران سولر گھر کے موجودہ لوڈ سے زیادہ رہنے کی توقع ہے۔" : "Solar is expected to remain above the current home load.",
  });
  if (peak) plan.push({
    time: hourLabel(peak.time, language), task: ur ? "سب سے بہتر وقت" : "Best solar period",
    reason: ur ? "دن کی سب سے زیادہ متوقع پیداوار۔" : "The highest predicted production of the day.",
  });
  if (weatherRisk) plan.push({
    time: ur ? "بادل یا بارش سے پہلے" : "Before clouds or rain", task: ur ? "ضروری کام مکمل کریں" : "Finish priority tasks",
    reason: ur ? "موسم کی تبدیلی سے سولر تیزی سے کم ہو سکتا ہے۔" : "Changing weather may reduce solar quickly.",
  });
  return {
    briefing, confidence: weatherRisk ? "low" : hours.length >= 6 ? "medium" : "low",
    confidenceReason: weatherRisk ? (ur ? "بادل یا بارش کی وجہ سے پیشگوئی بدل سکتی ہے۔" : "Cloud or rain may change the forecast.") : (ur ? "موسم مستحکم ہے، مگر یہ اب بھی ایک تخمینہ ہے۔" : "Weather looks stable, but this remains an estimate."),
    plan: plan.slice(0, 3), source: "local",
  };
}

function weatherConfidence(hours: ForecastHour[], language: "ur" | "en"): Pick<ForecastPlan, "confidence" | "confidenceReason"> {
  const ur = language === "ur";
  const severe = hours.some((hour) => hour.weatherCode >= 51 || hour.precipitationProbability >= 60 || hour.cloudCover >= 85);
  const cloudValues = hours.map((hour) => hour.cloudCover);
  const cloudSwing = cloudValues.length ? Math.max(...cloudValues) - Math.min(...cloudValues) : 100;
  const changeable = hours.some((hour) => hour.precipitationProbability >= 30) || cloudSwing >= 35;
  if (severe) return { confidence: "low", confidenceReason: ur ? "بارش یا گھنے بادل پیداوار کو تیزی سے بدل سکتے ہیں؛ موسم ہر 5 منٹ بعد تازہ ہوتا ہے۔" : "Rain or dense cloud can change output quickly; live weather refreshes every 5 minutes." };
  if (changeable) return { confidence: "medium", confidenceReason: ur ? "بادل بدل رہے ہیں، اس لیے اصل پیداوار مختلف ہو سکتی ہے۔" : "Cloud conditions are changing, so actual production may vary." };
  if (hours.length >= 6) return { confidence: "high", confidenceReason: ur ? "موسم مستحکم دکھائی دیتا ہے اور کافی گھنٹہ وار ڈیٹا دستیاب ہے۔" : "Weather looks stable and enough hourly data is available." };
  return { confidence: "low", confidenceReason: ur ? "اعتماد کے لیے گھنٹہ وار ڈیٹا کم ہے۔" : "There is limited hourly data for a confident plan." };
}

export default function ForecastAIPlan({ hours, appliances, loadKw, language }: { hours: ForecastHour[]; appliances: Appliance[]; loadKw: number; language: "ur" | "en" }) {
  const fallback = useMemo(() => localPlan(hours, loadKw, language), [hours, language, loadKw]);
  const signature = useMemo(() => JSON.stringify({
    language, day: hours[0]?.time.slice(0, 10), load: Math.round(loadKw), peak: Math.round(Math.max(...hours.map((hour) => hour.outputKw), 0)),
    hours: hours.map((hour) => [hour.time, Math.round(hour.cloudCover / 10) * 10, Math.round(hour.precipitationProbability / 10) * 10, hour.weatherCode]),
    appliances: appliances.filter((item) => item.quantity > 0).map((item) => [item.id, item.watts, item.quantity]),
  }), [appliances, hours, language, loadKw]);
  const [resolved, setResolved] = useState<{ signature: string; result: ForecastPlan } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hours.length) return;
    let cancelled = false;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CachedPlan | null;
      if (cached && cached.expiresAt > Date.now() && cached.signature === signature) {
        const timer = window.setTimeout(() => { if (!cancelled) setResolved({ signature, result: cached.result }); }, 0);
        return () => { cancelled = true; window.clearTimeout(timer); };
      }
    } catch { /* request a fresh plan */ }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/ai/forecast", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language, loadKw, hours: hours.map(({ time, outputKw, cloudCover, precipitationProbability, temperature, condition }) => ({ time, outputKw, cloudCover, precipitationProbability, temperature, condition })), appliances: appliances.filter((item) => item.quantity > 0) }),
        });
        if (!response.ok) return;
        const result = await response.json() as ForecastPlan;
        if (cancelled) return;
        setResolved({ signature, result });
        localStorage.setItem(CACHE_KEY, JSON.stringify({ expiresAt: Date.now() + CACHE_MS, signature, result } satisfies CachedPlan));
      } finally { if (!cancelled) setLoading(false); }
    }, 800);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [appliances, hours, language, loadKw, signature]);

  const result = resolved?.signature === signature ? resolved.result : fallback;
  const measuredConfidence = weatherConfidence(hours, language);
  const confidenceColor = measuredConfidence.confidence === "high" ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/15" : measuredConfidence.confidence === "medium" ? "text-amber-300 bg-amber-400/10 border-amber-400/15" : "text-rose-300 bg-rose-400/10 border-rose-400/15";
  const confidenceLabel = language === "ur" ? ({ high: "زیادہ اعتماد", medium: "درمیانہ اعتماد", low: "کم اعتماد" } as const)[measuredConfidence.confidence] : `${measuredConfidence.confidence[0].toUpperCase()}${measuredConfidence.confidence.slice(1)} confidence`;
  const sourceLabel = result.source === "gemini" ? "Gemini" : language === "ur" ? "مقامی منصوبہ" : "Local plan";

  return <GlassCard className="ai-plan-card border-violet-400/15 bg-violet-400/[0.04]">
    <div className="flex items-start justify-between gap-3">
      <div><p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300"><span className="ai-spark">✦</span>{language === "ur" ? "سمارٹ روزانہ منصوبہ" : "Smart daily plan"}</p><h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{language === "ur" ? "آج سولر کب استعمال کریں" : "When to use solar today"}</h3></div>
      <div className="flex flex-col items-end gap-1.5"><span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold ${confidenceColor}`}>{loading ? "…" : confidenceLabel}</span><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">{sourceLabel}</span></div>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-300">{result.briefing}</p>
    <p className="mt-1.5 flex items-start gap-2 text-xs leading-5 text-slate-500"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300/70" />{measuredConfidence.confidenceReason}</p>
    {result.plan.length > 0 && <div className="ai-plan-timeline mt-5 border-t border-white/[0.07] pt-4">{result.plan.map((item, index) => <div key={`${item.time}-${index}`} className="ai-plan-step grid grid-cols-[82px_1fr] gap-3 pb-4 last:pb-0"><span className="text-xs font-semibold text-violet-300">{item.time}</span><div><p className="text-sm font-medium text-white">{item.task}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{item.reason}</p></div></div>)}</div>}
  </GlassCard>;
}
