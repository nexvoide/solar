import type { DoctorSample } from "./solar-doctor";

export const HEALTH_THRESHOLDS = {
  baselineDays: 7,
  potentialTrendDays: 14,
  strongTrendDays: 30,
  reliableQuality: 0.65,
  decliningPointsPerWeek: -1.5,
  suddenDropPoints: 25,
  alertCooldownMs: 24 * 60 * 60_000,
} as const;

export type HealthStatus = "healthy" | "building_baseline" | "early_warning" | "warning" | "critical" | "insufficient_data";
export type HealthCause = "weather" | "soiling" | "shading" | "panel_degradation" | "inverter_degradation" | "inverter_fault" | "string_issue" | "sensor_issue" | "communication_issue" | "grid_curtailment" | "temperature" | "normal_variation" | "unknown";
export type MaintenanceType = "panels_cleaned" | "inverter_serviced" | "panels_replaced" | "wiring_serviced" | "shading_removed" | "other";
export interface MaintenanceEvent { id: string; time: number; type: MaintenanceType; note?: string; }
export interface HealthDay { time: number; expectedKwh: number; actualKwh: number; ratio: number; validSamples: number; expectedSamples: number; clearSamples: number; cloudySamples: number; rainSamples: number; hotSamples: number; faultSamples: number; offlineSamples: number; }
export interface HealthCauseScore { cause: HealthCause; score: number; evidence: string[]; contradictions: string[]; }
export interface PredictiveHealth {
  status: HealthStatus; healthScore: number; risk: "low" | "moderate" | "high"; dataQuality: number; daysAvailable: number; daysExpected: number;
  direction: "improving" | "stable" | "declining"; changePoints: number; slopePointsPerWeek: number; rolling7: number | null; rolling14: number | null; rolling30: number | null;
  baselineRatio: number | null; recentRatio: number | null; variance: number; confidence: "low" | "medium" | "high"; causes: HealthCauseScore[]; days: HealthDay[];
}
export interface HealthPatterns { recurringShading: boolean; recurringHour: number | null; }

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function aggregateDoctorSamples(samples: DoctorSample[]): HealthDay[] {
  const clean = [...new Map(samples.filter((sample) => Number.isFinite(sample.time) && sample.expectedKw >= 0 && sample.actualKw >= 0 && sample.actualKw <= Math.max(100, sample.expectedKw * 4)).map((sample) => [sample.time, sample])).values()].sort((a, b) => a.time - b.time);
  const groups = new Map<string, DoctorSample[]>();
  for (const sample of clean) { if (sample.expectedKw < 0.2) continue; const key = new Date(sample.time).toISOString().slice(0, 10); groups.set(key, [...(groups.get(key) ?? []), sample]); }
  return [...groups.entries()].map(([key, values]) => {
    let expectedKwh = 0; let actualKwh = 0; let validSamples = 0;
    for (let index = 0; index < values.length; index += 1) {
      const next = values[index + 1]; const intervalHours = next ? Math.min(15 * 60_000, Math.max(0, next.time - values[index].time)) / 3_600_000 : 5 / 60;
      if (intervalHours <= 0) continue; expectedKwh += values[index].expectedKw * intervalHours; actualKwh += values[index].actualKw * intervalHours; validSamples += 1;
    }
    const expectedSamples = 12 * 60 / 5;
    return { time: new Date(`${key}T12:00:00`).getTime(), expectedKwh, actualKwh, ratio: expectedKwh > 0 ? actualKwh / expectedKwh : 0, validSamples, expectedSamples, clearSamples: values.filter((v) => v.irradiance >= 600 && v.cloudCover < 40 && !v.rain).length, cloudySamples: values.filter((v) => v.cloudCover >= 70 || v.irradiance < 350).length, rainSamples: values.filter((v) => v.rain).length, hotSamples: values.filter((v) => (v.temperatureC ?? 0) >= 45).length, faultSamples: values.filter((v) => (v.faultCode ?? 0) > 0 || (v.warningCode ?? 0) > 0).length, offlineSamples: values.filter((v) => v.online === false).length };
  }).filter((day) => day.validSamples > 0).sort((a, b) => a.time - b.time);
}

export function detectHealthPatterns(samples: DoctorSample[]): HealthPatterns {
  const byHour = new Map<number, Set<string>>();
  for (const sample of samples) {
    if (sample.expectedKw < .5 || sample.actualKw / sample.expectedKw >= .8 || sample.irradiance < 600 || sample.cloudCover >= 40 || sample.rain) continue;
    const date = new Date(sample.time); const hour = date.getHours(); const days = byHour.get(hour) ?? new Set<string>(); days.add(date.toDateString()); byHour.set(hour, days);
  }
  const recurring = [...byHour.entries()].filter(([, days]) => days.size >= 3).sort((a, b) => b[1].size - a[1].size)[0];
  return { recurringShading: !!recurring, recurringHour: recurring?.[0] ?? null };
}

function rolling(days: HealthDay[], count: number): number | null { const values = days.slice(-count).map((day) => day.ratio); return values.length ? mean(values) : null; }
function regressionSlope(days: HealthDay[]): number {
  if (days.length < 2) return 0; const xs = days.map((_, index) => index); const ys = days.map((day) => day.ratio * 100); const mx = mean(xs); const my = mean(ys);
  const denominator = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0); return denominator ? xs.reduce((sum, x, index) => sum + (x - mx) * (ys[index] - my), 0) / denominator * 7 : 0;
}

export function analyzePredictiveHealth(daysInput: HealthDay[], maintenance: MaintenanceEvent[] = [], patterns: HealthPatterns = { recurringShading: false, recurringHour: null }): PredictiveHealth {
  const days = daysInput.filter((day) => day.expectedKwh > 0 && day.ratio >= 0 && day.ratio <= 2).sort((a, b) => a.time - b.time);
  const daysExpected = days.length ? Math.max(1, Math.round((days.at(-1)!.time - days[0].time) / 86400000) + 1) : 0;
  const coverage = days.length ? mean(days.map((day) => Math.min(1, day.validSamples / Math.max(1, day.expectedSamples * 0.35)))) : 0;
  const continuity = daysExpected ? days.length / daysExpected : 0; const dataQuality = clamp(coverage * 0.65 + continuity * 0.35);
  const slope = regressionSlope(days); const baselineDays = days.slice(0, Math.max(1, Math.ceil(days.length / 3))); const recentDays = days.slice(-Math.max(1, Math.ceil(days.length / 3)));
  const baselineRatio = days.length ? mean(baselineDays.map((day) => day.ratio)) : null; const recentRatio = days.length ? mean(recentDays.map((day) => day.ratio)) : null;
  const changePoints = baselineRatio !== null && recentRatio !== null ? (recentRatio - baselineRatio) * 100 : 0;
  const average = mean(days.map((day) => day.ratio)); const variance = mean(days.map((day) => (day.ratio - average) ** 2));
  const direction = slope <= HEALTH_THRESHOLDS.decliningPointsPerWeek ? "declining" : slope >= 1.5 ? "improving" : "stable";
  const cloudyShare = days.length ? days.reduce((sum, day) => sum + day.cloudySamples + day.rainSamples, 0) / Math.max(1, days.reduce((sum, day) => sum + day.validSamples, 0)) : 0;
  const clearDecline = direction === "declining" && cloudyShare < 0.35; const faults = days.reduce((sum, day) => sum + day.faultSamples, 0); const offline = days.reduce((sum, day) => sum + day.offlineSamples, 0);
  const last = days.at(-1); const before = days.length >= 4 ? mean(days.slice(-4, -1).map((day) => day.ratio)) : null; const sudden = !!last && before !== null && (before - last.ratio) * 100 >= HEALTH_THRESHOLDS.suddenDropPoints;
  const cleaning = maintenance.filter((event) => event.type === "panels_cleaned").sort((a, b) => b.time - a.time)[0];
  const beforeCleaning = cleaning ? days.filter((day) => day.time < cleaning.time).slice(-3) : []; const afterCleaning = cleaning ? days.filter((day) => day.time >= cleaning.time).slice(0, 3) : [];
  const recoveryAfterCleaning = beforeCleaning.length >= 2 && afterCleaning.length >= 2 && mean(afterCleaning.map((d) => d.ratio)) > mean(beforeCleaning.map((d) => d.ratio)) + 0.07;
  const cause = (cause: HealthCause, score: number, evidence: string[], contradictions: string[] = []): HealthCauseScore => ({ cause, score: Number(clamp(score).toFixed(2)), evidence, contradictions });
  const causes = [
    cause("inverter_fault", faults ? Math.min(1, .65 + faults * .05) : 0, faults ? [`${faults} recorded samples contained inverter fault or warning evidence.`] : [], faults ? [] : ["No inverter fault or warning was recorded."]),
    cause("communication_issue", offline ? Math.min(.9, .4 + offline * .04) : 0, offline ? [`${offline} samples were marked offline or unavailable.`] : []),
    cause("soiling", recoveryAfterCleaning ? .88 : clearDecline ? .67 : .08, recoveryAfterCleaning ? ["Weather-normalized performance improved after recorded panel cleaning."] : clearDecline ? ["Normalized performance declined across predominantly clear-weather samples."] : [], cloudyShare >= .35 ? ["A substantial share of samples had clouds or rain."] : []),
    cause("shading", patterns.recurringShading ? .82 : .06, patterns.recurringShading ? [`Clear-weather underperformance recurred near ${String(patterns.recurringHour).padStart(2, "0")}:00 on at least three recorded days.`] : []),
    cause("weather", direction === "declining" && cloudyShare >= .35 ? .72 : .12, cloudyShare >= .35 ? ["Cloudy or rainy measurements overlap the lower-performance period."] : [], clearDecline ? ["The decline also appears in favorable solar conditions."] : []),
    cause("temperature", days.some((day) => day.hotSamples > day.validSamples * .3) ? .58 : .08, days.some((day) => day.hotSamples > day.validSamples * .3) ? ["High temperature affected a substantial share of recorded samples."] : []),
    cause("inverter_degradation", clearDecline && faults ? .55 : clearDecline ? .25 : .05, clearDecline ? ["Total-system output declined relative to expected production."] : [], faults ? [] : ["Conversion-efficiency and MPPT telemetry are unavailable, so inverter degradation cannot be confirmed."]),
    cause("sensor_issue", variance > .08 ? .48 : .06, variance > .08 ? ["Normalized performance is unusually inconsistent."] : []),
    cause("normal_variation", direction === "stable" ? .85 : .18, direction === "stable" ? ["The regression trend remains within the normal variation band."] : []),
    cause("unknown", direction === "declining" ? .3 : .05, direction === "declining" ? ["Some decline remains unexplained by available telemetry."] : []),
  ].filter((item) => item.score >= .1).sort((a, b) => b.score - a.score);
  let status: HealthStatus = "healthy";
  if (days.length < HEALTH_THRESHOLDS.baselineDays) status = days.length ? "building_baseline" : "insufficient_data";
  else if (dataQuality < HEALTH_THRESHOLDS.reliableQuality) status = "insufficient_data";
  else if (sudden && faults) status = "critical";
  else if (direction === "declining" && days.length >= HEALTH_THRESHOLDS.potentialTrendDays) status = days.length >= HEALTH_THRESHOLDS.strongTrendDays ? "warning" : "early_warning";
  else if (direction === "declining") status = "early_warning";
  const trendPenalty = Math.min(30, Math.max(0, -slope * 2.5)); const performancePenalty = recentRatio === null ? 15 : Math.min(30, Math.max(0, (0.95 - recentRatio) * 100)); const reliabilityPenalty = faults ? Math.min(25, faults * 4) : 0;
  const healthScore = days.length ? Math.max(0, Math.min(100, Math.round(100 - trendPenalty - performancePenalty - reliabilityPenalty - (1 - dataQuality) * 15))) : 0;
  const confidence = days.length >= 30 && dataQuality >= .85 ? "high" : days.length >= 14 && dataQuality >= .7 ? "medium" : "low";
  return { status, healthScore, risk: status === "critical" || status === "warning" ? "high" : status === "early_warning" ? "moderate" : "low", dataQuality, daysAvailable: days.length, daysExpected, direction, changePoints, slopePointsPerWeek: slope, rolling7: rolling(days, 7), rolling14: rolling(days, 14), rolling30: rolling(days, 30), baselineRatio, recentRatio, variance, confidence, causes, days };
}
