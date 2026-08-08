"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AnimatedValue from "@/components/dashboard/AnimatedValue";
import GlassCard, { HeroMetric, MetricRow, SectionTitle } from "@/components/dashboard/GlassCard";
import SettingsPanel from "@/components/SettingsPanel";
import { useSettings } from "@/components/SettingsProvider";
import { formatPower, toKw } from "@/lib/formatPower";
import { getStatusKey } from "@/lib/i18n/translations";
import type { FieldReading, LiveData } from "@/lib/knox";

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
  const { t, unit, dir } = useSettings();
  const [data, setData] = useState<LiveData | null>(null);
  const [state, setState] = useState<FetchState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

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
      setJustUpdated(true);
      setSecondsAgo(0);
      setTimeout(() => setJustUpdated(false), 700);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : t("fetchFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [onDisconnect, t]);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, REFRESH_MS);
    return () => clearInterval(id);
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

  const statusLabel = useMemo(() => {
    if (!data) return "—";
    return t(getStatusKey(data.statusCode, data.isGenerating));
  }, [data, t]);

  const pvDisplay = data ? formatPower(data.pvPower.value, data.pvPower.unit, unit) : "—";
  const loadDisplay = data ? formatPower(data.loadPower.value, data.loadPower.unit, unit) : "—";
  const noProduction = data ? (toKw(data.pvPower.value, data.pvPower.unit) ?? 0) < 0.01 : false;

  const solarHint = noProduction ? t("noProduction") : t("solarGeneratingHint");
  const homeHint = t("homeUsingHint");
  const gridHint = data?.gridConnected ? t("gridConnectedHint") : t("gridOfflineHint");

  return (
    <div dir={dir} className="solar-bg min-h-dvh pb-8">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#070b12]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white">{t("appTitle")}</h1>
            <p className="text-xs text-slate-500">{t("dashboardSubtitle")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {refreshing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#5dffc0]/30 border-t-[#5dffc0]" />
            ) : state === "online" ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                <span className="live-dot" />
                {t("live")}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-lg"
              aria-label={t("settings")}
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-5">
        {state === "loading" && !data && (
          <GlassCard className="flex flex-col items-center gap-4 py-12">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-amber-400/20 border-t-amber-400" />
            <p className="text-slate-400">{t("connecting")}</p>
          </GlassCard>
        )}

        {error && state !== "online" && (
          <GlassCard className="border-red-500/20 py-4 text-center text-red-300">
            ⚠️ {error}
          </GlassCard>
        )}

        {data && (
          <>
            {/* Main cards — plain language */}
            <HeroMetric
              icon="☀️"
              label={t("solarGenerating")}
              value={<AnimatedValue value={pvDisplay} />}
              hint={solarHint}
              accent="solar"
              refreshing={refreshing}
              pulse={justUpdated && data.isGenerating}
              large
            />

            <HeroMetric
              icon="🏠"
              label={t("homeUsing")}
              value={<AnimatedValue value={loadDisplay} />}
              hint={homeHint}
              accent="home"
              refreshing={refreshing}
              pulse={justUpdated}
              large
            />

            <GlassCard accent="grid" refreshing={refreshing} pulse={justUpdated}>
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-2xl">
                  🔌
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t("electricityConnection")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">
                    {data.gridConnected ? t("gridConnected") : t("offline")}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{gridHint}</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard accent="live" pulse={justUpdated && data.isGenerating}>
              <div className="flex items-start gap-4">
                <span className="text-3xl">
                  {data.isGenerating ? "✨" : data.statusCode === 1 ? "💤" : "⚠️"}
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t("machineStatus")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">{statusLabel}</p>
                  <p className="mt-1 text-sm text-slate-500">{t("machineStatusHint")}</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard accent="solar">
              <SectionTitle icon="📊" title={t("todaySolar")} color="text-amber-400" />
              <p className="text-3xl font-bold tabular-nums text-white">
                {data.todayEnergy.value !== "—"
                  ? `${data.todayEnergy.value} ${data.todayEnergy.unit || t("todayEnergyUnit")}`
                  : "—"}
              </p>
              <p className="mt-2 text-sm text-slate-500">{t("todaySolarHint")}</p>
            </GlassCard>

            {/* Optional technical details — hidden by default */}
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-sm font-medium text-slate-400 transition hover:text-slate-200"
            >
              {showDetails ? t("hideDetails") : t("showDetails")}
            </button>

            {showDetails && (
              <div className="space-y-3">
                <GlassCard accent="solar" refreshing={refreshing}>
                  <SectionTitle icon="🌞" title={t("solarDetails")} color="text-amber-400" />
                  <MetricRow label={t("sunVoltage")} value={formatField(data.pvVoltage, "V")} />
                  <MetricRow label={t("sunCurrent")} value={formatField(data.pvCurrent, "A")} />
                </GlassCard>
                <GlassCard accent="grid" refreshing={refreshing}>
                  <SectionTitle icon="⚡" title={t("electricityConnection")} color="text-violet-400" />
                  <MetricRow label={t("lineVoltage")} value={formatField(data.gridVoltage, "V")} />
                  <MetricRow label={t("lineFrequency")} value={formatField(data.gridFrequency, "Hz")} />
                </GlassCard>
                <GlassCard accent="live" refreshing={refreshing}>
                  <SectionTitle icon="🔌" title={t("homeElectricity")} color="text-emerald-400" />
                  <MetricRow label={t("homeVoltage")} value={formatField(data.outputVoltage, "V")} />
                  <MetricRow label={t("homeCurrent")} value={formatField(data.outputCurrent, "A")} />
                </GlassCard>
                {isNonZero(data.faultCode) && (
                  <GlassCard accent="neutral">
                    <MetricRow label={t("faultCode")} value={data.faultCode.value} />
                  </GlassCard>
                )}
              </div>
            )}

            <footer className="space-y-3 pt-2 text-center">
              <p className="text-xs text-slate-500">
                {t("updatedAgo")} {secondsAgo} {t("secondsAgo")}
              </p>
              <button
                type="button"
                onClick={onDisconnect}
                className="w-full rounded-xl border border-white/[0.08] py-3 text-sm text-slate-500 hover:text-slate-300"
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
