import { parsePowerKw, type Appliance, type SolarForecastSettings } from "./solar-forecast";
import type { LiveData } from "./knox";

export const ENERGY_HISTORY_KEY = "knox_energy_history_v1";
export const ENERGY_RULES_KEY = "knox_notification_rules_v1";
export const ENERGY_SITES_KEY = "knox_sites_v1";
export const FORECAST_SETTINGS_KEY = "knox_solar_forecast_settings_v1";
export const APPLIANCES_KEY = "knox_solar_forecast_appliances_v1";

export interface EnergyHistoryPoint { time: number; pvKw: number; loadKw: number; temperature: number | null; }
export interface NotificationRules { enabled: boolean; solarAboveKw: number; surplusAboveKw: number; suddenDropPercent: number; inverterOffline: boolean; applianceReady: boolean; cloudsAhead: boolean; }
export interface EnergySite { id: string; name: string; type: "home" | "farm" | "office" | "warehouse"; forecast: SolarForecastSettings | null; appliances: Appliance[]; }

export const DEFAULT_RULES: NotificationRules = { enabled: false, solarAboveKw: 4, surplusAboveKw: 1, suddenDropPercent: 35, inverterOffline: true, applianceReady: true, cloudsAhead: true };

export function readLocal<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

export function recordHistory(data: LiveData): void {
  const points = readLocal<EnergyHistoryPoint[]>(ENERGY_HISTORY_KEY, []);
  const now = new Date(data.fetchedAt).getTime();
  if (points.at(-1) && now - points.at(-1)!.time < 5 * 60_000) return;
  const temperature = Number.parseFloat(data.temperature.value);
  points.push({ time: now, pvKw: parsePowerKw(data.pvPower.value, data.pvPower.unit) ?? 0, loadKw: parsePowerKw(data.loadPower.value, data.loadPower.unit) ?? 0, temperature: Number.isFinite(temperature) ? temperature : null });
  localStorage.setItem(ENERGY_HISTORY_KEY, JSON.stringify(points.slice(-12_000)));
}

export function aggregateHistory(points: EnergyHistoryPoint[], range: "day" | "week" | "month" | "year") {
  const span = range === "day" ? 86400000 : range === "week" ? 7 * 86400000 : range === "month" ? 30 * 86400000 : 365 * 86400000;
  const filtered = points.filter((point) => point.time >= Date.now() - span);
  const bucketMs = range === "day" ? 3600000 : range === "week" ? 86400000 : range === "month" ? 86400000 : 30 * 86400000;
  const buckets = new Map<number, EnergyHistoryPoint[]>();
  for (const point of filtered) { const key = Math.floor(point.time / bucketMs) * bucketMs; buckets.set(key, [...(buckets.get(key) ?? []), point]); }
  return [...buckets.entries()].map(([time, values]) => ({ time, pvKw: values.reduce((sum, value) => sum + value.pvKw, 0) / values.length, loadKw: values.reduce((sum, value) => sum + value.loadKw, 0) / values.length, temperature: values.reduce((sum, value) => sum + (value.temperature ?? 0), 0) / Math.max(1, values.filter((value) => value.temperature !== null).length) }));
}

export function historyCsv(points: EnergyHistoryPoint[]): string {
  return ["timestamp,solar_kw,load_kw,temperature_c", ...points.map((point) => `${new Date(point.time).toISOString()},${point.pvKw},${point.loadKw},${point.temperature ?? ""}`)].join("\n");
}

export function healthScore(data: LiveData, history: EnergyHistoryPoint[]): { score: number; label: string; reasons: string[] } {
  let score = 100; const reasons: string[] = [];
  const temp = Number.parseFloat(data.temperature.value);
  if (Number.isFinite(temp) && temp > 45) { score -= Math.min(18, (temp - 45) * 1.5); reasons.push("High inverter temperature is reducing efficiency."); }
  if (data.statusCode === 1) { score -= 30; reasons.push("Inverter is offline or in standby."); }
  if (Number.parseFloat(data.faultCode.value) > 0) { score -= 35; reasons.push(`Fault code ${data.faultCode.value} is active.`); }
  const recent = history.slice(-24);
  if (recent.length >= 12) {
    const productive = recent.filter((point) => point.pvKw > 0.1);
    if (productive.length >= 6) {
      const first = productive.slice(0, Math.ceil(productive.length / 2)).reduce((sum, point) => sum + point.pvKw, 0) / Math.ceil(productive.length / 2);
      const last = productive.slice(-Math.ceil(productive.length / 2)).reduce((sum, point) => sum + point.pvKw, 0) / Math.ceil(productive.length / 2);
      if (last < first * 0.65) { score -= 10; reasons.push("Recent production dropped significantly; weather, shade, or panel condition may be responsible."); }
    }
  }
  score = Math.max(0, Math.round(score));
  return { score, label: score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 55 ? "Attention" : "Check system", reasons: reasons.length ? reasons : ["No active faults or abnormal temperature detected."] };
}
