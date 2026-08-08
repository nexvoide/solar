"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyRealtimeAdjustment,
  availability,
  calculateForecast,
  DEFAULT_APPLIANCES,
  mergeCurrentWeatherObservation,
  ORIENTATION_AZIMUTH,
  parsePowerKw,
  type SolarForecastSettings,
  type WeatherHour,
} from "@/lib/solar-forecast";
import type { LiveData } from "@/lib/knox";
import { useSettings } from "@/components/SettingsProvider";
import { applianceNames, forecastCopy } from "@/lib/i18n/forecast";
import { DEFAULT_RULES, ENERGY_RULES_KEY, readLocal, type NotificationRules } from "@/lib/energy-platform";
import { formatPowerKw } from "@/lib/formatPower";

const SETTINGS_KEY = "knox_solar_forecast_settings_v1";
const LEARNING_KEY = "knox_solar_forecast_learning_v1";

interface ForecastWeather {
  current?: Record<string, string | number>;
  hourly?: Record<string, Array<string | number>>;
  daily?: { sunrise?: string[]; sunset?: string[] };
}

function weatherHours(weather: ForecastWeather): WeatherHour[] {
  const hourly = weather.hourly;
  if (!hourly?.time) return [];
  return hourly.time.map((time, index) => ({
    time: String(time),
    temperature: Number(hourly.temperature_2m?.[index] ?? 25),
    humidity: Number(hourly.relative_humidity_2m?.[index] ?? 0),
    cloudCover: Number(hourly.cloud_cover?.[index] ?? 0),
    precipitationProbability: Number(hourly.precipitation_probability?.[index] ?? 0),
    windSpeed: Number(hourly.wind_speed_10m?.[index] ?? 0),
    uvIndex: Number(hourly.uv_index?.[index] ?? 0),
    weatherCode: Number(hourly.weather_code?.[index] ?? 0),
    irradiance: Number(hourly.shortwave_radiation?.[index] ?? 0),
    tiltedIrradiance: hourly.global_tilted_irradiance?.[index] == null ? null : Number(hourly.global_tilted_irradiance[index]),
  }));
}

export default function ForecastSnapshot({ data, onOpen }: { data: LiveData; onOpen: () => void }) {
  const { language, unit } = useSettings();
  const copy = forecastCopy[language];
  const [settings, setSettings] = useState<SolarForecastSettings | null>(null);
  const [weather, setWeather] = useState<ForecastWeather | null>(null);
  const [calibration, setCalibration] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        const learned = localStorage.getItem(LEARNING_KEY);
        setSettings(saved ? JSON.parse(saved) as SolarForecastSettings : null);
        setCalibration(learned ? Number(JSON.parse(learned).calibration ?? 1) : 1);
      } catch {
        setSettings(null);
      }
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadForecast = useCallback(async (config: SolarForecastSettings) => {
    const params = new URLSearchParams({ latitude: String(config.latitude), longitude: String(config.longitude), tilt: String(config.roofTilt), azimuth: String(ORIENTATION_AZIMUTH[config.orientation]) });
    try {
      const response = await fetch(`/api/forecast/weather?${params}`, { cache: "no-store" });
      if (response.ok) setWeather(await response.json() as ForecastWeather);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    const refresh = () => { if (document.visibilityState === "visible") void loadForecast(settings); };
    const first = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearTimeout(first); window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [loadForecast, settings]);

  const actual = parsePowerKw(data.pvPower.value, data.pvPower.unit) ?? 0;
  const forecast = useMemo(() => {
    if (!settings || !weather?.daily?.sunrise?.[0] || !weather.daily.sunset?.[0]) return { current: null, next: null, hours: [] };
    const observedWeather = mergeCurrentWeatherObservation(weatherHours(weather), weather.current, data.fetchedAt);
    const hours = calculateForecast(settings, observedWeather, weather.daily.sunrise[0], weather.daily.sunset[0], calibration);
    const adjustedHours = applyRealtimeAdjustment(hours, data.fetchedAt, actual);
    const now = new Date(data.fetchedAt).getTime();
    const current = adjustedHours.reduce((best, hour) => !best || Math.abs(new Date(hour.time).getTime() - now) < Math.abs(new Date(best.time).getTime() - now) ? hour : best, adjustedHours[0] ?? null);
    const next = adjustedHours.find((hour) => new Date(hour.time).getTime() > now + 30 * 60 * 1000) ?? null;
    return { current, next, hours: adjustedHours };
  }, [actual, calibration, data.fetchedAt, settings, weather]);

  useEffect(() => {
    if (!settings || !("Notification" in window) || Notification.permission !== "granted") return;
    const rules = { ...DEFAULT_RULES, ...readLocal<NotificationRules>(ENERGY_RULES_KEY, DEFAULT_RULES) };
    if (!rules.enabled) return;
    const actual = parsePowerKw(data.pvPower.value, data.pvPower.unit) ?? 0;
    const load = parsePowerKw(data.loadPower.value, data.loadPower.unit) ?? 0;
    const surplusWatts = Math.max(0, actual - load) * 1000;
    const notify = (key: string, body: string) => { if (sessionStorage.getItem(key)) return; new Notification("Knox Solar", { body, icon: "/icons/icon-192.png" }); sessionStorage.setItem(key, "1"); };
    if (rules.applianceReady) {
      const appliance = [...DEFAULT_APPLIANCES].sort((a,b)=>b.watts-a.watts).find((item)=>item.watts <= surplusWatts * .85);
      if (appliance) notify("knox_alert_appliance", `${appliance.name} can safely run with the current solar surplus.`);
    }
    if (rules.cloudsAhead && forecast.current && forecast.next && forecast.next.cloudCover > forecast.current.cloudCover + 25) {
      notify("knox_alert_clouds", `Cloud cover is expected to rise to ${forecast.next.cloudCover}% within the next hour.`);
    }
  }, [data, forecast, settings]);

  if (!settings) {
    return <button type="button" onClick={onOpen} className="forecast-launch group w-full overflow-hidden rounded-[1.4rem] border border-emerald-400/20 p-5 text-start transition sm:p-6"><span className="flex items-center justify-between gap-4"><span><span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">{copy.assistant}</span><span className="mt-1.5 block text-xl font-semibold text-white">{copy.setupForecast}</span><span className="mt-1 block text-sm text-slate-400">{copy.setupDashboardHint}</span></span><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-300 text-xl text-[#07110d]">→</span></span></button>;
  }

  const load = parsePowerKw(data.loadPower.value, data.loadPower.unit) ?? 0;
  const surplus = Math.max(0, actual - load);
  const predicted = forecast.current?.outputKw ?? 0;
  const nextOutput = forecast.next?.outputKw ?? predicted;
  const capacity = settings.panels * settings.panelWattage / 1000;
  const status = availability(actual, capacity);
  const statusLabel = status.label === "Excellent" ? copy.excellent : status.label === "Moderate" ? copy.moderate : copy.low;
  const safeAppliance = [...DEFAULT_APPLIANCES].sort((a, b) => b.watts - a.watts).find((appliance) => appliance.watts <= surplus * 1000 * 0.85);
  const maxOutput = Math.max(...forecast.hours.map((hour) => hour.outputKw), 0.1);

  return (
    <button type="button" onClick={onOpen} className="forecast-dashboard-card group w-full text-start">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">{copy.forecastNow}</p><p className="mt-1 text-xs text-slate-500">📍 {settings.latitude.toFixed(4)}, {settings.longitude.toFixed(4)}</p></div>
        <div className="flex flex-col items-end gap-1.5"><span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${status.color === "emerald" ? "bg-emerald-400/10 text-emerald-300" : status.color === "amber" ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300"}`}>{statusLabel}</span><span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />{language === "ur" ? "موسم ہر 5 منٹ" : "Weather · 5 min"}</span></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <SnapshotMetric primary label={copy.currentSolar} value={formatPowerKw(actual, unit)} color="text-amber-300" />
        <SnapshotMetric divider label={copy.houseLoad} value={formatPowerKw(load, unit)} color="text-sky-300" />
        <SnapshotMetric label={copy.forecastSolar} value={loading ? "…" : formatPowerKw(predicted, unit)} color="text-emerald-300" />
        <SnapshotMetric wide label={copy.nextHour} value={loading ? "…" : formatPowerKw(nextOutput, unit)} color="text-violet-300" />
      </div>
      {forecast.hours.length > 0 && <div className="border-t border-white/[0.07] px-5 py-4 sm:px-6"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{copy.todayTimeline}</span><span className="text-xs text-slate-500">{forecast.next?.condition ?? forecast.current?.condition}</span></div><div className="flex h-16 items-end gap-1.5">{forecast.hours.map((hour) => <div key={hour.time} className="group/bar flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="w-full rounded-t bg-gradient-to-t from-emerald-500/35 to-amber-300/80 transition" style={{ height: `${Math.max(4, hour.outputKw / maxOutput * 44)}px` }}/><span className="text-[8px] text-slate-700">{new Date(hour.time).getHours()}</span></div>)}</div></div>}
      <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] px-5 py-4 text-xs sm:px-6"><span className={safeAppliance ? "text-slate-300" : "text-slate-500"}>{safeAppliance ? `${copy.safeStart} ${applianceNames[language][safeAppliance.id] ?? safeAppliance.name}.` : copy.noHeadroom}</span><span className="shrink-0 text-emerald-400 transition group-hover:translate-x-1">{copy.viewDetails} →</span></div>
    </button>
  );
}

function SnapshotMetric({ label, value, color, primary = false, divider = false, wide = false }: { label: string; value: string; color: string; primary?: boolean; divider?: boolean; wide?: boolean }) {
  return <div className={`${primary ? "col-span-2 border-b border-white/[0.07] py-6 sm:col-span-1 sm:border-b-0" : wide ? "col-span-2 border-t border-white/[0.07] py-5 sm:col-span-1 sm:border-t-0" : "py-5"} ${divider ? "border-e border-white/[0.07]" : ""} px-3 text-center sm:border-e sm:border-white/[0.07] sm:px-6 sm:py-6 sm:last:border-e-0`}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</p><p className={`mt-2 font-bold tabular-nums ${primary ? "text-4xl sm:text-2xl" : "text-2xl"} ${color}`}>{value}</p></div>;
}
