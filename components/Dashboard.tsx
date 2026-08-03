"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GlassCard, { MetricRow, SectionTitle } from "@/components/dashboard/GlassCard";
import SettingsPanel from "@/components/SettingsPanel";
import SolarForecastAssistant from "@/components/SolarForecastAssistant";
import ForecastSnapshot from "@/components/dashboard/ForecastSnapshot";
import EnergyPlatformModal from "@/components/EnergyPlatformModal";
import { useSettings } from "@/components/SettingsProvider";
import { toKw } from "@/lib/formatPower";
import { getStatusKey } from "@/lib/i18n/translations";
import type { FieldReading, LiveData } from "@/lib/knox";
import { DEFAULT_RULES, ENERGY_HISTORY_KEY, ENERGY_RULES_KEY, readLocal, recordHistory, type EnergyHistoryPoint, type NotificationRules } from "@/lib/energy-platform";
import { parsePowerKw } from "@/lib/solar-forecast";

interface DashboardProps {
  onDisconnect: () => void;
}

type FetchState = "loading" | "online" | "offline" | "error";

const REFRESH_MS = 3000;

function formatField(reading: FieldReading, suffix = ""): string {
  if (reading.value === "—") return "—";
  return `${reading.value}${reading.unit ? ` ${reading.unit}` : suffix ? ` ${suffix}` : ""}`;
}

function isNonZero(reading: FieldReading): boolean {
  const n = parseFloat(reading.value);
  return !Number.isNaN(n) && n !== 0;
}

export default function Dashboard({ onDisconnect }: DashboardProps) {
  const { t, dir } = useSettings();
  const [data, setData] = useState<LiveData | null>(null);
  const [state, setState] = useState<FetchState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [forecastRevision, setForecastRevision] = useState(0);
  const [energyCenterOpen, setEnergyCenterOpen] = useState(false);
  const closeForecast = useCallback(() => { setShowForecast(false); setForecastRevision((value) => value + 1); }, []);
  const closeDetails = useCallback(() => setShowDetails(false), []);
  const closeEnergyCenter = useCallback(() => { setEnergyCenterOpen(false); setForecastRevision((value) => value + 1); }, []);

  const fetchLive = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/live?_=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (json.offline || res.status === 503) {
          setState("offline");
          setError(json.error ?? t("inverterOffline"));
          return;
        }
        if (res.status === 401) {
          onDisconnect();
          return;
        }
        throw new Error(json.error ?? t("fetchFailed"));
      }

      setData(json as LiveData);
      setState("online");
      setError(null);
      setSecondsAgo(0);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : t("fetchFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [onDisconnect, t]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      await fetchLive();
      if (!cancelled) timer = setTimeout(poll, REFRESH_MS);
    };

    const scheduleNow = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(poll, 0);
    };

    scheduleNow();
    document.addEventListener("visibilitychange", scheduleNow);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", scheduleNow);
    };
  }, [fetchLive]);

  useEffect(() => {
    if (!data?.fetchedAt) return;
    const tick = setInterval(() => {
      setSecondsAgo(
        Math.floor((Date.now() - new Date(data.fetchedAt).getTime()) / 1000),
      );
    }, 1000);
    return () => clearInterval(tick);
  }, [data?.fetchedAt]);

  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => {
      recordHistory(data);
      const rules = readLocal<NotificationRules>(ENERGY_RULES_KEY, DEFAULT_RULES);
      if (!rules.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
      const pv = parsePowerKw(data.pvPower.value, data.pvPower.unit) ?? 0;
      const load = parsePowerKw(data.loadPower.value, data.loadPower.unit) ?? 0;
      const notify = (key: string, message: string) => { if (sessionStorage.getItem(key)) return; new Notification("Knox Solar", { body: message, icon: "/icons/icon-192.png" }); sessionStorage.setItem(key, "1"); };
      if (pv >= rules.solarAboveKw) notify("knox_alert_solar", `Solar production reached ${pv.toFixed(1)} kW.`);
      if (pv - load >= rules.surplusAboveKw) notify("knox_alert_surplus", `${(pv-load).toFixed(1)} kW surplus solar is available.`);
      if (rules.inverterOffline && data.statusCode === 1) notify("knox_alert_offline", "The inverter appears to be offline.");
      const history = readLocal<EnergyHistoryPoint[]>(ENERGY_HISTORY_KEY, []);
      const previous = history.at(-2);
      if (previous?.pvKw && pv > 0.1 && pv < previous.pvKw * (1 - rules.suddenDropPercent / 100)) notify("knox_alert_drop", `Solar production dropped ${Math.round((1-pv/previous.pvKw)*100)}%.`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data]);

  const statusLabel = useMemo(() => {
    if (!data) return "—";
    return t(getStatusKey(data.statusCode, data.isGenerating));
  }, [data, t]);

  const noProduction = data ? (toKw(data.pvPower.value, data.pvPower.unit) ?? 0) < 0.01 : false;
  const panelTemp = data ? Number.parseFloat(data.temperature.value) : Number.NaN;
  const healthy = data ? !isNonZero(data.faultCode) && data.statusCode !== 2 && data.statusCode !== 5 : false;

  return (
    <div dir={dir} className="solar-bg min-h-dvh pb-10">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070c13]/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark"><span /></div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">{t("appTitle")}</h1>
              <p className="truncate text-[11px] text-slate-500">PV9000 · {t("dashboardSubtitle")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {refreshing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#5dffc0]/30 border-t-[#5dffc0]" />
            ) : state === "online" ? (
              <span className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                <span className="live-dot" />
                {t("live")}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="icon-button"
              aria-label={t("settings")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6 1.7 1.7 0 00-.4 1.1V21h-4v-.1A1.7 1.7 0 008.6 19.4a1.7 1.7 0 00-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-.6-1 1.7 1.7 0 00-1.1-.4H3v-4h.1A1.7 1.7 0 004.6 8.6a1.7 1.7 0 00-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-.6 1.7 1.7 0 00.4-1.1V3h4v.1A1.7 1.7 0 0015.4 4a1.7 1.7 0 001.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0019.4 9c.08.38.28.72.6 1 .3.25.68.4 1.1.4h.1v4h-.1c-.42 0-.8.15-1.1.4-.32.28-.52.62-.6 1z"/></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {state === "loading" && !data && (
          <GlassCard className="flex flex-col items-center gap-4 py-12">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-amber-400/20 border-t-amber-400" />
            <p className="text-slate-400">{t("connecting")}</p>
          </GlassCard>
        )}

        {error && state !== "online" && (
          <GlassCard className="border-red-500/20 py-4 text-center text-red-300">
            <div className="flex items-center justify-between gap-3"><span>⚠️ {error}</span><button type="button" onClick={() => void fetchLive()} className="shrink-0 rounded-full border border-red-300/20 px-3 py-1.5 text-xs">{t("refreshNow")}</button></div>
          </GlassCard>
        )}

        {data && (
          <>
            <ForecastSnapshot key={forecastRevision} data={data} onOpen={() => setShowForecast(true)} />

            {showForecast && <div dir="ltr"><SolarForecastAssistant data={data} onClose={closeForecast} /></div>}

            <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
              <GlassCard className="flex flex-col justify-between">
                <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("deviceHealth")}</p><p className="mt-2 text-2xl font-semibold text-white">{healthy ? t("statusOnline") : statusLabel}</p></div><div className={`flex h-12 w-12 items-center justify-center rounded-full border ${healthy ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"}`}>{healthy ? "✓" : "!"}</div></div>
                <div className="mt-6 grid grid-cols-3 divide-x divide-white/[0.07] rtl:divide-x-reverse"><CompactMetric label={t("todayEnergy")} value={data.todayEnergy.value !== "—" ? `${data.todayEnergy.value} ${data.todayEnergy.unit || t("todayEnergyUnit")}` : "—"}/><CompactMetric label={t("gridStatus")} value={data.gridConnected ? t("gridConnected") : t("offline")}/><CompactMetric label={t("temperature")} value={Number.isFinite(panelTemp) ? `${panelTemp.toFixed(0)}°C` : "—"}/></div>
              </GlassCard>
              <GlassCard accent={noProduction ? "neutral" : "live"}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">{t("navOverview")}</p>
                <p className="mt-3 text-lg font-medium leading-7 text-white">{noProduction ? t("noProduction") : healthy ? t("solarGeneratingHint") : t("machineStatusHint")}</p>
                <p className="mt-4 text-xs text-slate-500">{t("updatedAgo")} {secondsAgo} {t("secondsAgo")}</p>
              </GlassCard>
            </div>

            <button type="button" onClick={() => setEnergyCenterOpen(true)} className="forecast-launch group w-full rounded-[1.4rem] border border-white/[0.08] p-5 text-start sm:p-6"><span className="flex items-center justify-between gap-4"><span><span className="text-[11px] font-semibold uppercase tracking-[.2em] text-emerald-400">Knox Intelligence</span><span className="mt-1.5 block text-xl font-semibold text-white">Energy Center</span><span className="mt-1 block text-sm text-slate-500">Load simulator · Scheduler · Analytics · Health · Notifications · Sites</span></span><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[.07] text-white transition group-hover:bg-emerald-300 group-hover:text-black">→</span></span></button>

            {energyCenterOpen && <EnergyPlatformModal data={data} onClose={closeEnergyCenter} />}

            {/* Optional technical details — hidden by default */}
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="mx-auto flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-xs font-semibold text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200"
            >
              {t("showDetails")}
            </button>

            {showDetails && <TechnicalDetailsModal data={data} refreshing={refreshing} onClose={closeDetails} />}

            <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-5 text-center sm:flex-row">
              <p className="text-xs text-slate-500">
                {t("updatedAgo")} {secondsAgo} {t("secondsAgo")}
              </p>
              <button
                type="button"
                onClick={onDisconnect}
                className="rounded-xl border border-white/[0.08] px-5 py-2.5 text-xs text-slate-500 hover:text-slate-300"
              >
                {t("disconnect")}
              </button>
            </footer>
          </>
        )}
      </main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function MetricIcon({ type }: { type: "solar" | "home" | "grid" | "energy" }) {
  if (type === "solar") return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
  if (type === "home") return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 10.5L12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/></svg>;
  if (type === "grid") return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2h8l-1 7h3l-6 13 1-9H8z"/></svg>;
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/></svg>;
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-3 text-center first:ps-0 last:pe-0"><p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-600">{label}</p><p className="mt-2 truncate text-sm font-semibold text-slate-200 sm:text-base">{value}</p></div>;
}

function TechnicalDetailsModal({ data, refreshing, onClose }: { data: LiveData; refreshing: boolean; onClose: () => void }) {
  const { t, dir } = useSettings();

  useEffect(() => {
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
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-[#03070d]/80 p-0 backdrop-blur-md sm:p-5" role="presentation" onMouseDown={onClose}>
      <div dir={dir} className="flex h-dvh w-full max-w-3xl flex-col overflow-hidden border border-white/[0.08] bg-[#091019] shadow-2xl shadow-black/60 sm:h-auto sm:max-h-[min(90dvh,780px)] sm:rounded-[2rem]" role="dialog" aria-modal="true" aria-label={t("showDetails")} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#091019]/95 px-5 py-4 backdrop-blur-xl sm:px-7 sm:py-5">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">PV9000</p><h2 className="mt-1 text-xl font-semibold text-white">{t("showDetails").replace(" ▼", "")}</h2></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-lg text-slate-400 hover:text-white" aria-label={t("close")}>×</button>
        </div>
        <div className="grid flex-1 gap-4 overflow-y-auto p-4 pb-[calc(2rem+var(--safe-bottom))] overscroll-contain sm:grid-cols-2 sm:p-7">
          <GlassCard accent="solar" refreshing={refreshing}>
            <SectionTitle icon={<MetricIcon type="solar" />} title={t("solarDetails")} color="text-amber-400" />
            <MetricRow label={t("sunVoltage")} value={formatField(data.pvVoltage, "V")} />
            <MetricRow label={t("sunCurrent")} value={formatField(data.pvCurrent, "A")} />
          </GlassCard>
          <GlassCard accent="grid" refreshing={refreshing}>
            <SectionTitle icon={<MetricIcon type="grid" />} title={t("electricityConnection")} color="text-violet-400" />
            <MetricRow label={t("lineVoltage")} value={formatField(data.gridVoltage, "V")} />
            <MetricRow label={t("lineFrequency")} value={formatField(data.gridFrequency, "Hz")} />
          </GlassCard>
          <GlassCard accent="live" refreshing={refreshing}>
            <SectionTitle icon={<MetricIcon type="home" />} title={t("homeElectricity")} color="text-emerald-400" />
            <MetricRow label={t("homeVoltage")} value={formatField(data.outputVoltage, "V")} />
            <MetricRow label={t("homeCurrent")} value={formatField(data.outputCurrent, "A")} />
          </GlassCard>
          {isNonZero(data.faultCode) && <GlassCard accent="neutral"><MetricRow label={t("faultCode")} value={data.faultCode.value} /></GlassCard>}
        </div>
      </div>
    </div>
  );
}
