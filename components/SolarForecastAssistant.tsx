"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import GlassCard from "@/components/dashboard/GlassCard";
import {
  applyRealtimeAdjustment,
  availability,
  calculateForecast,
  DEFAULT_APPLIANCES,
  mergeCurrentWeatherObservation,
  ORIENTATION_AZIMUTH,
  parsePowerKw,
  type Appliance,
  type ForecastHour,
  type PanelOrientation,
  type SolarForecastSettings,
  type SolarSystemType,
  type WeatherHour,
} from "@/lib/solar-forecast";
import type { LiveData } from "@/lib/knox";
import { useSettings } from "@/components/SettingsProvider";
import { applianceNames, forecastCopy } from "@/lib/i18n/forecast";
import { formatPowerKw } from "@/lib/formatPower";
import ForecastAIPlan from "@/components/dashboard/ForecastAIPlan";

const SETTINGS_KEY = "knox_solar_forecast_settings_v1";
const APPLIANCES_KEY = "knox_solar_forecast_appliances_v1";
const LEARNING_KEY = "knox_solar_forecast_learning_v1";
const WEATHER_REFRESH_MS = 5 * 60 * 1000;

interface WeatherResponse {
  timezone: string;
  current?: Record<string, number | string>;
  hourly?: Record<string, Array<number | string>>;
  daily?: { sunrise?: string[]; sunset?: string[] };
}

interface LearningState {
  calibration: number;
  cloudCoefficient?: number;
  temperatureCoefficient?: number;
  samples: Array<{ key: string; ratio: number }>;
}

interface LocationResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  accuracy?: number;
}

function coordinateLabel(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function nearestHour(hours: ForecastHour[], now: number): ForecastHour | null {
  return hours.reduce<ForecastHour | null>((best, hour) => {
    if (!best) return hour;
    return Math.abs(new Date(hour.time).getTime() - now) < Math.abs(new Date(best.time).getTime() - now)
      ? hour
      : best;
  }, null);
}

function formatHour(time: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(time));
}

function localCondition(condition: string, copy: Record<string, string>): string {
  const keys: Record<string, string> = { Sunny: "sunny", "Partly cloudy": "partlyCloudy", Cloudy: "cloudy", "Rain likely": "rainLikely", "Rain possible": "rainPossible", Foggy: "foggy", Thunderstorm: "thunderstorm" };
  return copy[keys[condition]] ?? condition;
}

function parseWeather(data: WeatherResponse): WeatherHour[] {
  const hourly = data.hourly;
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
    tiltedIrradiance: hourly.global_tilted_irradiance?.[index] == null
      ? null
      : Number(hourly.global_tilted_irradiance[index]),
  }));
}

export default function SolarForecastAssistant({ data, onClose }: { data: LiveData; onClose: () => void }) {
  const { language, dir, unit } = useSettings();
  const copy = forecastCopy[language];
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<SolarForecastSettings | null>(null);
  const [appliances, setAppliances] = useState<Appliance[]>(DEFAULT_APPLIANCES);
  const [learning, setLearning] = useState<LearningState>({ calibration: 1, cloudCoefficient: 1, temperatureCoefficient: 1, samples: [] });
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(readJson<SolarForecastSettings | null>(SETTINGS_KEY, null));
      setAppliances(readJson(APPLIANCES_KEY, DEFAULT_APPLIANCES));
      const savedLearning = readJson<LearningState>(LEARNING_KEY, { calibration: 1, samples: [] });
      setLearning({ ...savedLearning, cloudCoefficient: savedLearning.cloudCoefficient ?? 1, temperatureCoefficient: savedLearning.temperatureCoefficient ?? 1 });
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fetchWeather = useCallback(async (config: SolarForecastSettings) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      latitude: String(config.latitude),
      longitude: String(config.longitude),
      tilt: String(config.roofTilt),
      azimuth: String(ORIENTATION_AZIMUTH[config.orientation]),
    });
    try {
      const response = await fetch(`/api/forecast/weather?${params}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Forecast unavailable");
      setWeather(json as WeatherResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Forecast unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    const refresh = () => {
      if (!cancelled && document.visibilityState === "visible") void fetchWeather(settings);
    };
    const first = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, WEATHER_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchWeather, settings]);

  const actualPv = parsePowerKw(data.pvPower.value, data.pvPower.unit) ?? 0;
  const forecast = useMemo(() => {
    if (!settings || !weather?.daily?.sunrise?.[0] || !weather.daily.sunset?.[0]) return [];
    const observedWeather = mergeCurrentWeatherObservation(parseWeather(weather), weather.current, data.fetchedAt);
    const baseForecast = calculateForecast(
      settings,
      observedWeather,
      weather.daily.sunrise[0],
      weather.daily.sunset[0],
      learning.calibration * (learning.cloudCoefficient ?? 1) * (learning.temperatureCoefficient ?? 1),
    );
    return applyRealtimeAdjustment(baseForecast, data.fetchedAt, actualPv);
  }, [actualPv, data.fetchedAt, learning.calibration, learning.cloudCoefficient, learning.temperatureCoefficient, settings, weather]);

  const referenceTime = new Date(data.fetchedAt).getTime();
  const currentForecast = useMemo(() => {
    if (!forecast.length) return null;
    return nearestHour(forecast, referenceTime);
  }, [forecast, referenceTime]);
  const houseLoad = parsePowerKw(data.loadPower.value, data.loadPower.unit) ?? 0;
  const predictedPv = currentForecast?.outputKw ?? 0;
  const surplusKw = Math.max(0, predictedPv - houseLoad);
  const accuracy = predictedPv > 0.05
    ? Math.max(0, Math.min(100, (1 - Math.abs(actualPv - predictedPv) / predictedPv) * 100))
    : actualPv < 0.05 ? 100 : 0;

  useEffect(() => {
    if (!currentForecast || actualPv < 0.05 || predictedPv < 0.05) return;
    const key = currentForecast.time;
    if (learning.samples.some((sample) => sample.key === key)) return;
    const activeCalibration = learning.calibration * (learning.cloudCoefficient ?? 1) * (learning.temperatureCoefficient ?? 1);
    const ratio = Math.max(0.5, Math.min(1.5, activeCalibration * actualPv / predictedPv));
    const samples = [...learning.samples, { key, ratio }].slice(-30);
    const average = samples.reduce((sum, sample) => sum + sample.ratio, 0) / samples.length;
    const adjustment = Math.max(0.98, Math.min(1.02, ratio));
    const next = {
      samples,
      calibration: Math.max(0.8, Math.min(1.2, learning.calibration * 0.9 + average * 0.1)),
      cloudCoefficient: currentForecast.cloudCover >= 35 ? Math.max(0.85, Math.min(1.15, (learning.cloudCoefficient ?? 1) * adjustment)) : (learning.cloudCoefficient ?? 1),
      temperatureCoefficient: currentForecast.temperature >= 35 ? Math.max(0.9, Math.min(1.1, (learning.temperatureCoefficient ?? 1) * adjustment)) : (learning.temperatureCoefficient ?? 1),
    };
    const timer = window.setTimeout(() => {
      localStorage.setItem(LEARNING_KEY, JSON.stringify(next));
      setLearning(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [actualPv, currentForecast, learning, predictedPv]);

  const recommendations = useMemo(() => {
    let remaining = Math.round(surplusKw * 1000);
    const selected: Array<{ id: string; name: string; quantity: number; watts: number }> = [];
    for (const appliance of appliances) {
      if (appliance.watts <= 0 || appliance.quantity <= 0) continue;
      const quantity = Math.min(appliance.quantity, Math.floor(remaining / appliance.watts));
      if (quantity > 0) {
        selected.push({ id: appliance.id, name: appliance.name, quantity, watts: appliance.watts });
        remaining -= quantity * appliance.watts;
      }
    }
    return { selected, remaining };
  }, [appliances, surplusKw]);

  const nextHour = forecast.find((hour) => new Date(hour.time).getTime() > referenceTime + 30 * 60_000);
  const fallingSoon = nextHour && currentForecast && nextHour.outputKw < currentForecast.outputKw - 0.3;
  const forecastDeficitWatts = Math.max(0, Math.ceil((houseLoad - predictedPv) * 1000));
  const shutdownSuggestion = [...appliances]
    .filter((appliance) => appliance.watts > 0)
    .sort((a, b) => a.watts - b.watts)
    .find((appliance) => appliance.watts >= forecastDeficitWatts) ??
    [...appliances].sort((a, b) => b.watts - a.watts)[0];

  if (!ready) return <ForecastModal onClose={onClose}><div className="py-24 text-center text-slate-400">{copy.loading}</div></ForecastModal>;
  if (!settings || editing) {
    return (
      <ForecastModal onClose={onClose}>
        <ForecastSetup
          initial={settings}
          onCancel={settings ? () => setEditing(false) : undefined}
          onSave={(next) => {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
            setSettings(next);
            setEditing(false);
          }}
        />
      </ForecastModal>
    );
  }

  const capacityKw = (settings.panels * settings.panelWattage) / 1000;
  const status = availability(predictedPv, capacityKw);
  const statusClasses = status.color === "emerald"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
    : status.color === "amber"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
      : "border-red-400/25 bg-red-400/10 text-red-300";

  return (
    <ForecastModal onClose={onClose}>
    <section dir={dir} className="space-y-5" aria-label={copy.assistant}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">{copy.assistant}</p>
          <h2 className="mt-1 text-2xl font-bold text-white">{copy.canTurnOn}</h2>
          <p className="mt-1 text-sm text-slate-500">📍 {coordinateLabel(settings.latitude, settings.longitude)}{settings.locationAccuracy ? ` · ±${Math.round(settings.locationAccuracy)} m` : ""} · {formatPowerKw(capacityKw, unit)} array</p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400">{copy.editSetup}</button>
      </div>

      {error && <GlassCard className="border-red-500/20 py-4 text-sm text-red-300">⚠️ {error} <button onClick={() => void fetchWeather(settings)} className="underline">Retry</button></GlassCard>}

      <div className="grid grid-cols-2 gap-3">
        <MetricCard label={copy.currentSolar} value={formatPowerKw(actualPv, unit)} accent="text-amber-300" />
        <MetricCard label={copy.forecastSolar} value={loading && !weather ? "…" : formatPowerKw(predictedPv, unit)} accent="text-emerald-300" />
        <MetricCard label={copy.houseLoad} value={formatPowerKw(houseLoad, unit)} accent="text-sky-300" />
        <MetricCard label={copy.accuracy} value={`${accuracy.toFixed(0)}%`} accent="text-violet-300" />
      </div>

      <GlassCard className={`border ${statusClasses}`}>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-wider opacity-70">{copy.availability}</p><p className="mt-1 text-xl font-bold">{status.label === "Excellent" ? "🟢" : status.label === "Moderate" ? "🟡" : "🔴"} {status.label === "Excellent" ? copy.excellent : status.label === "Moderate" ? copy.moderate : copy.low}</p></div>
          <p className="max-w-[55%] text-end text-xs opacity-80">{status.label === "Excellent" ? copy.excellentMsg : status.label === "Moderate" ? copy.moderateMsg : copy.lowMsg}</p>
        </div>
      </GlassCard>

      {forecast.length > 0 && <ForecastAIPlan hours={forecast} appliances={appliances} loadKw={houseLoad} language={language} />}

      <GlassCard accent="live">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{copy.surplusNow}</p>
        <p className="mt-2 text-4xl font-bold text-emerald-300">{formatPowerKw(surplusKw, unit)}</p>
        <p className="mt-2 text-sm text-slate-500">{copy.surplusHint}</p>
      </GlassCard>

      {weather?.current && (
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <WeatherChip icon="☁️" value={`${weather.current.cloud_cover ?? 0}%`} label={copy.cloud} />
          <WeatherChip icon="🌡️" value={`${weather.current.temperature_2m ?? 0}°`} label={copy.temp} />
          <WeatherChip icon="💧" value={`${weather.current.relative_humidity_2m ?? 0}%`} label={copy.humidity} />
          <WeatherChip icon="💨" value={`${weather.current.wind_speed_10m ?? 0}`} label={copy.wind} />
        </div>
      )}

      <div>
        <h3 className="mb-3 text-lg font-bold text-white">{copy.hourly}</h3>
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 hide-scrollbar">
          {forecast.map((hour) => (
            <article key={hour.time} className="glass min-w-[150px] snap-start p-4">
              <p className="text-sm font-semibold text-slate-300">{formatHour(hour.time)}</p>
              <p className="mt-3 text-2xl font-bold text-white">{formatPowerKw(hour.outputKw, unit)}</p>
              <p className="mt-2 text-xs text-slate-500">{localCondition(hour.condition, copy)}</p>
              <p className="mt-3 text-[11px] text-slate-600">☁ {hour.cloudCover}% · UV {hour.uvIndex.toFixed(1)}</p>
              <p className="text-[11px] text-slate-600">{copy.rain} {hour.precipitationProbability}%</p>
            </article>
          ))}
        </div>
      </div>

      <GlassCard>
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-white">{copy.recommended}</h3><span className="text-xs text-slate-500">{copy.editWatts}</span></div>
        {fallingSoon && <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-300">⚠️ {copy.falling}</div>}
        {forecastDeficitWatts > 0 && shutdownSuggestion && <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">⚠️ {copy.deficitA} {forecastDeficitWatts} {copy.deficitB} {applianceNames[language][shutdownSuggestion.id] ?? shutdownSuggestion.name}</div>}
        <div className="mt-4 space-y-2">
          {recommendations.selected.length ? recommendations.selected.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-sm"><span className="text-slate-300">✅ {item.quantity > 1 ? `${item.quantity} × ` : ""}{applianceNames[language][item.id] ?? item.name}</span><span className="text-slate-500">{item.quantity * item.watts} W</span></div>
          )) : <p className="text-sm text-red-300">{copy.essential}</p>}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-4"><span className="text-sm text-slate-400">{copy.remaining}</span><strong className="text-emerald-300">{recommendations.remaining} W</strong></div>
      </GlassCard>

      <ApplianceEditor appliances={appliances} onChange={(next) => { setAppliances(next); localStorage.setItem(APPLIANCES_KEY, JSON.stringify(next)); }} />
      <p className="text-center text-[11px] leading-relaxed text-slate-600">{copy.disclaimer}</p>
    </section>
    </ForecastModal>
  );
}

function ForecastModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const { language, dir } = useSettings();
  const copy = forecastCopy[language];
  return (
    <div className="forecast-modal fixed inset-0 z-[80] flex items-end justify-center bg-[#03070d]/80 backdrop-blur-md sm:items-center sm:p-5" role="presentation" onMouseDown={onClose}>
      <div dir={dir} className="forecast-modal-panel relative h-[96dvh] w-full max-w-3xl overflow-y-auto rounded-t-[2rem] border border-white/[0.08] bg-[#091019] shadow-2xl shadow-black/60 sm:h-[min(92dvh,900px)] sm:rounded-[2rem]" role="dialog" aria-modal="true" aria-label={copy.assistant} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.07] bg-[#091019]/90 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">⌁</span><div><p className="text-sm font-semibold text-white">{copy.assistant}</p><p className="text-[11px] text-slate-500">{copy.planning}</p></div></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-lg text-slate-400 transition hover:bg-white/[0.08] hover:text-white" aria-label="Close forecast">×</button>
        </div>
        <div className="p-4 pb-[calc(2rem+var(--safe-bottom))] sm:p-7">{children}</div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <GlassCard className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-2 text-xl font-bold tabular-nums ${accent}`}>{value}</p></GlassCard>;
}

function WeatherChip({ icon, value, label }: { icon: string; value: string; label: string }) {
  return <div className="rounded-xl bg-white/[0.04] p-2"><span>{icon}</span><p className="mt-1 font-semibold text-slate-300">{value}</p><p className="text-[10px] text-slate-600">{label}</p></div>;
}

function ApplianceEditor({ appliances, onChange }: { appliances: Appliance[]; onChange: (value: Appliance[]) => void }) {
  const { language } = useSettings();
  const copy = forecastCopy[language];
  const [open, setOpen] = useState(false);
  return <GlassCard><button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between text-start"><span className="font-semibold text-white">{copy.applianceSettings}</span><span className="text-slate-500">{open ? "−" : "+"}</span></button>{open && <div className="mt-4 space-y-3">{appliances.map((item, index) => <div key={item.id} className="grid grid-cols-[1fr_76px_58px] items-center gap-2"><span className="text-xs text-slate-400">{applianceNames[language][item.id] ?? item.name}</span><input aria-label={`${item.name} watts`} type="number" min="1" value={item.watts} onChange={(event) => onChange(appliances.map((entry, i) => i === index ? { ...entry, watts: Number(event.target.value) } : entry))} className="input-solar !rounded-lg !p-2 !text-xs"/><input aria-label={`${item.name} quantity`} type="number" min="0" max="20" value={item.quantity} onChange={(event) => onChange(appliances.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} className="input-solar !rounded-lg !p-2 !text-xs"/></div>)}</div>}</GlassCard>;
}

function ForecastSetup({ initial, onSave, onCancel }: { initial: SolarForecastSettings | null; onSave: (value: SolarForecastSettings) => void; onCancel?: () => void }) {
  const { language } = useSettings();
  const copy = forecastCopy[language];
  const [city, setCity] = useState(initial?.locationName ?? "");
  const [location, setLocation] = useState<LocationResult | null>(initial ? { id: 0, name: initial.locationName, latitude: initial.latitude, longitude: initial.longitude, accuracy: initial.locationAccuracy } : null);
  const [results, setResults] = useState<LocationResult[]>([]);
  const [panels, setPanels] = useState(initial?.panels ?? 10);
  const [wattage, setWattage] = useState(initial?.panelWattage ?? 550);
  const [orientation, setOrientation] = useState<PanelOrientation>(initial?.orientation ?? "south");
  const [tilt, setTilt] = useState(initial?.roofTilt ?? 30);
  const [systemType, setSystemType] = useState<SolarSystemType>(initial?.systemType ?? "off-grid");
  const [efficiency, setEfficiency] = useState(initial?.systemEfficiency ?? 90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orientationLabels: Record<string, string> = language === "ur" ? { south: "جنوب", "south-east": "جنوب مشرق", "south-west": "جنوب مغرب", east: "مشرق", west: "مغرب", north: "شمال" } : {};
  const systemLabels: Record<SolarSystemType, string> = language === "ur" ? { "off-grid": "آف گرڈ", hybrid: "ہائبرڈ", "net-metering": "نیٹ میٹرنگ" } : { "off-grid": "Off grid", hybrid: "Hybrid", "net-metering": "Net metering" };

  async function searchCity() {
    if (city.trim().length < 2) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/forecast/geocode?q=${encodeURIComponent(city.trim())}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Location not found");
      setResults((json.results ?? []) as LocationResult[]);
      if (!json.results?.length) setError("No matching city found");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Location search failed"); }
    finally { setBusy(false); }
  }

  function useGps() {
    if (!navigator.geolocation) { setError("GPS is not supported by this browser"); return; }
    if (!window.isSecureContext) {
      setError("GPS is blocked because this page is using an insecure HTTP address. Open the dashboard on localhost or deploy it with HTTPS, then try again.");
      return;
    }
    setBusy(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          id: 0,
          name: coordinateLabel(position.coords.latitude, position.coords.longitude),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setLocation(next);
        setCity("");
        setResults([]);
        setBusy(false);
      },
      (gpsError) => {
        if (gpsError.code === gpsError.PERMISSION_DENIED) {
          setError("Location permission is blocked. Allow Location for this site in your browser settings, then try again.");
        } else if (gpsError.code === gpsError.POSITION_UNAVAILABLE) {
          setError("Your device could not determine its location. Turn on device Location Services and Wi-Fi, then try again.");
        } else if (gpsError.code === gpsError.TIMEOUT) {
          setError("Location detection timed out. Move near a window or outdoors and try again.");
        } else {
          setError("The browser could not access your location. Check browser and device Location settings.");
        }
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!location) { setError("Choose a city result or use GPS"); return; }
    onSave({ locationName: location.name, latitude: location.latitude, longitude: location.longitude, locationAccuracy: location.accuracy, panels: Math.max(1, panels), panelWattage: Math.max(1, wattage), orientation, roofTilt: Math.max(0, Math.min(90, tilt)), systemType, systemEfficiency: Math.max(50, Math.min(100, efficiency)) });
  }

  return <GlassCard accent="solar"><div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">{copy.assistant}</p><h2 className="mt-2 text-2xl font-bold text-white">{copy.setupTitle}</h2><p className="mt-2 text-sm text-slate-500">{copy.setupHint}</p></div><form onSubmit={submit} className="space-y-5">
    <div><label className="mb-2 block text-sm font-semibold text-slate-300">{copy.exactLocation}</label><button type="button" onClick={useGps} disabled={busy} className="btn-solar w-full">◎ {busy ? copy.gettingLocation : copy.useGps}</button>{location && <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3"><p className="text-sm font-semibold text-emerald-300">✓ {coordinateLabel(location.latitude, location.longitude)}</p>{location.accuracy && <p className="mt-1 text-xs text-emerald-400/70">{copy.gpsAccuracy} ±{Math.round(location.accuracy)} {copy.metres}</p>}</div>}<details className="mt-3"><summary className="cursor-pointer text-xs text-slate-500">{copy.cityFallback}</summary><div className="mt-3 flex gap-2"><input value={city} onChange={(event) => { setCity(event.target.value); setLocation(null); }} className="input-solar" placeholder={copy.enterCity}/><button type="button" onClick={() => void searchCity()} className="rounded-xl bg-white/10 px-4 text-sm text-white">{copy.search}</button></div>{results.length > 0 && <div className="mt-2 space-y-1">{results.map((item) => <button key={item.id} type="button" onClick={() => { setLocation(item); setCity([item.name, item.admin1, item.country].filter(Boolean).join(", ")); setResults([]); }} className="block w-full rounded-xl bg-white/[0.05] p-3 text-start text-sm text-slate-300">{[item.name, item.admin1, item.country].filter(Boolean).join(", ")}</button>)}</div>}</details></div>
    <div className="grid grid-cols-2 gap-3"><SetupNumber label={copy.panels} value={panels} min={1} max={100} onChange={setPanels}/><SetupNumber label={copy.wattage} value={wattage} min={50} max={1000} onChange={setWattage}/></div>
    <div><label className="mb-2 block text-sm font-semibold text-slate-300">{copy.orientation}</label><select value={orientation} onChange={(event) => setOrientation(event.target.value as PanelOrientation)} className="input-solar">{["south", "south-east", "south-west", "east", "west", "north"].map((value) => <option key={value} value={value}>{orientationLabels[value] ?? value.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>)}</select></div>
    <div className="grid grid-cols-2 gap-3"><SetupNumber label={copy.tilt} value={tilt} min={0} max={90} onChange={setTilt}/><SetupNumber label={copy.efficiency} value={efficiency} min={50} max={100} onChange={setEfficiency}/></div>
    <div><label className="mb-2 block text-sm font-semibold text-slate-300">{copy.systemType}</label><div className="grid grid-cols-3 gap-2">{(["off-grid", "hybrid", "net-metering"] as SolarSystemType[]).map((value) => <button key={value} type="button" onClick={() => setSystemType(value)} className={`rounded-xl border p-3 text-xs ${systemType === value ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-slate-500"}`}>{systemLabels[value]}</button>)}</div></div>
    {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">⚠️ {error}</p>}<div className="flex gap-2">{onCancel && <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-white/10 p-3 text-slate-400">{copy.cancel}</button>}<button type="submit" disabled={busy || !location} className="btn-solar flex-1">{busy ? copy.wait : copy.save}</button></div>
  </form></GlassCard>;
}

function SetupNumber({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="text-sm font-semibold text-slate-300">{label}<input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="input-solar mt-2"/></label>;
}
