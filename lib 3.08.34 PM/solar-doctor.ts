export const SOLAR_DOCTOR_THRESHOLDS = {
  healthyRatio: 0.9,
  slightRatio: 0.8,
  potentialIssueRatio: 0.6,
  minimumExpectedKw: 0.35,
  clippingTolerance: 0.05,
  persistenceReadings: 3,
  persistenceMs: 10 * 60_000,
} as const;

export type DoctorStatus = "unavailable" | "healthy" | "slightly_low" | "possible_issue" | "strong_anomaly" | "normal_clipping";
export type DoctorSeverity = "good" | "info" | "warning" | "critical";
export type DoctorCause = "weather" | "rain" | "soiling" | "shading" | "temperature" | "inverter" | "string" | "gridCurtailment" | "sensorIssue" | "normalClipping" | "unknown";

export interface DoctorSample {
  time: number;
  expectedKw: number;
  actualKw: number;
  irradiance: number;
  cloudCover: number;
  rain: boolean;
  temperatureC?: number | null;
  faultCode?: number;
  warningCode?: number;
  online?: boolean;
}

export interface DoctorInput {
  now: number;
  expectedAcKw: number | null;
  actualAcKw: number | null;
  panelCapacityKw: number;
  inverterMaxAcKw: number | null;
  irradiance: number | null;
  previousIrradiance?: number | null;
  cloudCover: number | null;
  temperatureC: number | null;
  rain: boolean;
  weatherCode: number | null;
  gridConnected: boolean;
  statusCode: number | null;
  faultCode: number;
  warningCode: number;
  history: DoctorSample[];
}

export interface DoctorDiagnostic {
  status: DoctorStatus;
  severity: DoctorSeverity;
  expectedAcKw: number | null;
  actualAcKw: number | null;
  differenceKw: number | null;
  performanceRatio: number | null;
  underperformancePercent: number | null;
  persistent: boolean;
  persistedMinutes: number;
  causes: Array<{ cause: DoctorCause; score: number; evidence: string[] }>;
  dataNotes: string[];
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function score(cause: DoctorCause, value: number, evidence: string[]) {
  return { cause, score: Number(clamp(value).toFixed(2)), evidence };
}

export function diagnoseSolar(input: DoctorInput): DoctorDiagnostic {
  const expected = input.expectedAcKw;
  const actual = input.actualAcKw;
  const dataNotes = [
    "String-level measurements are not available.",
    "Export-curtailment status is not available.",
  ];
  if (expected === null || actual === null || expected < SOLAR_DOCTOR_THRESHOLDS.minimumExpectedKw) {
    return { status: "unavailable", severity: "info", expectedAcKw: expected, actualAcKw: actual, differenceKw: null, performanceRatio: null, underperformancePercent: null, persistent: false, persistedMinutes: 0, causes: [], dataNotes };
  }

  const ratio = Math.max(0, actual / expected);
  const underperformance = Math.max(0, (1 - ratio) * 100);
  const combined = [...input.history, { time: input.now, expectedKw: expected, actualKw: actual, irradiance: input.irradiance ?? 0, cloudCover: input.cloudCover ?? 0, rain: input.rain }];
  const distinct = [...new Map(combined.map((sample) => [sample.time, sample])).values()];
  const recentLow = distinct
    .filter((sample) => sample.expectedKw >= SOLAR_DOCTOR_THRESHOLDS.minimumExpectedKw && sample.actualKw / sample.expectedKw < SOLAR_DOCTOR_THRESHOLDS.slightRatio)
    .sort((a, b) => a.time - b.time);
  const tail = recentLow.slice(-SOLAR_DOCTOR_THRESHOLDS.persistenceReadings);
  const persistedMinutes = tail.length >= SOLAR_DOCTOR_THRESHOLDS.persistenceReadings ? (tail.at(-1)!.time - tail[0].time) / 60_000 : 0;
  const persistent = tail.length >= SOLAR_DOCTOR_THRESHOLDS.persistenceReadings && persistedMinutes >= SOLAR_DOCTOR_THRESHOLDS.persistenceMs / 60_000;

  const atInverterLimit = input.inverterMaxAcKw !== null
    && input.panelCapacityKw > input.inverterMaxAcKw
    && expected >= input.inverterMaxAcKw * (1 - SOLAR_DOCTOR_THRESHOLDS.clippingTolerance)
    && actual >= input.inverterMaxAcKw * (1 - SOLAR_DOCTOR_THRESHOLDS.clippingTolerance);
  if (atInverterLimit) {
    return { status: "normal_clipping", severity: "good", expectedAcKw: expected, actualAcKw: actual, differenceKw: actual - expected, performanceRatio: ratio, underperformancePercent: underperformance, persistent, persistedMinutes, causes: [score("normalClipping", 0.99, ["PV array capacity exceeds the configured inverter AC limit.", "Actual output is at the inverter limit."])], dataNotes };
  }

  let status: DoctorStatus = ratio >= SOLAR_DOCTOR_THRESHOLDS.healthyRatio ? "healthy" : ratio >= SOLAR_DOCTOR_THRESHOLDS.slightRatio ? "slightly_low" : ratio >= SOLAR_DOCTOR_THRESHOLDS.potentialIssueRatio ? "possible_issue" : "strong_anomaly";
  if (!persistent && (status === "possible_issue" || status === "strong_anomaly")) status = "slightly_low";

  const irradianceDrop = input.previousIrradiance && input.previousIrradiance > 0 && input.irradiance !== null
    ? Math.max(0, 1 - input.irradiance / input.previousIrradiance) : 0;
  const weatherEvidence: string[] = [];
  if ((input.cloudCover ?? 0) >= 70) weatherEvidence.push("Current cloud cover is high.");
  if (irradianceDrop >= 0.25) weatherEvidence.push(`Measured irradiance fell about ${Math.round(irradianceDrop * 100)}%.`);
  if ((input.irradiance ?? 1000) < 350) weatherEvidence.push("Current irradiance is low.");
  const weatherScore = clamp(((input.cloudCover ?? 0) / 100) * 0.55 + irradianceDrop * 0.8 + ((input.irradiance ?? 1000) < 350 ? 0.35 : 0));
  const rainEvidence = input.rain ? ["Current weather reports measured rain or precipitation."] : [];
  const heatEvidence = (input.temperatureC ?? 0) >= 40 ? [`Temperature is ${input.temperatureC!.toFixed(0)}°C, which can reduce PV efficiency.`] : [];
  const faultActive = input.faultCode > 0 || input.warningCode > 0 || input.statusCode === 2 || input.statusCode === 5;
  const strongSun = (input.irradiance ?? 0) >= 600 && (input.cloudCover ?? 100) < 40 && !input.rain;
  const unexplainedPersistent = persistent && strongSun && ratio < SOLAR_DOCTOR_THRESHOLDS.slightRatio;
  const currentHour = new Date(input.now).getHours();
  const sameHourClear = input.history.filter((sample) => Math.abs(new Date(sample.time).getHours() - currentHour) <= 1 && sample.irradiance >= 600 && sample.cloudCover < 40 && !sample.rain && sample.expectedKw >= SOLAR_DOCTOR_THRESHOLDS.minimumExpectedKw);
  const repeatedDays = new Set(sameHourClear.filter((sample) => sample.actualKw / sample.expectedKw < SOLAR_DOCTOR_THRESHOLDS.slightRatio).map((sample) => new Date(sample.time).toDateString())).size;
  const shadingPattern = strongSun && ratio < SOLAR_DOCTOR_THRESHOLDS.slightRatio && repeatedDays >= 3;
  const clearDaily = new Map<string, number[]>();
  for (const sample of input.history) {
    if (sample.irradiance < 600 || sample.cloudCover >= 40 || sample.rain || sample.expectedKw < SOLAR_DOCTOR_THRESHOLDS.minimumExpectedKw) continue;
    const day = new Date(sample.time).toDateString();
    clearDaily.set(day, [...(clearDaily.get(day) ?? []), sample.actualKw / sample.expectedKw]);
  }
  const dailyRatios = [...clearDaily.entries()].map(([day, values]) => ({ time: new Date(day).getTime(), ratio: values.reduce((sum, value) => sum + value, 0) / values.length })).sort((a, b) => a.time - b.time);
  const gradualDecline = dailyRatios.length >= 5 && dailyRatios.at(-1)!.ratio < dailyRatios[0].ratio - 0.08;
  const causes = [
    score("rain", input.rain ? 0.95 : 0, rainEvidence),
    score("weather", weatherScore, weatherEvidence),
    score("temperature", heatEvidence.length ? Math.min(0.75, 0.35 + ((input.temperatureC ?? 40) - 40) * 0.04) : 0.05, heatEvidence),
    score("inverter", faultActive ? 0.95 : actual < 0.05 && strongSun && persistent ? 0.7 : 0.08, faultActive ? [`Inverter fault/warning evidence is active (fault ${input.faultCode}, warning ${input.warningCode}).`] : []),
    score("gridCurtailment", !input.gridConnected && actual < expected * 0.6 ? 0.45 : 0.05, !input.gridConnected ? ["The grid is currently reported disconnected; export or operating limits are not exposed."] : []),
    score("soiling", gradualDecline ? 0.78 : unexplainedPersistent ? 0.68 : 0.08, gradualDecline ? ["Clear-weather performance has gradually declined across multiple recorded days.", "Weather does not explain the trend."] : unexplainedPersistent ? ["Strong irradiance and clear weather do not explain the persistent shortfall.", "No active inverter fault explains the reduction."] : []),
    score("shading", shadingPattern ? 0.82 : unexplainedPersistent ? 0.5 : 0.06, shadingPattern ? [`A similar clear-weather drop occurred around this time on ${repeatedDays} recorded days.`] : unexplainedPersistent ? ["The persistent clear-weather shortfall could be consistent with shading, but a repeated daily pattern is not established yet."] : []),
    score("unknown", ratio < SOLAR_DOCTOR_THRESHOLDS.slightRatio ? 0.3 : 0.05, ratio < SOLAR_DOCTOR_THRESHOLDS.slightRatio ? ["Available measurements do not fully explain the difference."] : []),
  ].filter((item) => item.score >= 0.1).sort((a, b) => b.score - a.score);

  const severity: DoctorSeverity = status === "healthy" ? "good" : status === "strong_anomaly" && faultActive ? "critical" : status === "possible_issue" || status === "strong_anomaly" ? "warning" : "info";
  return { status, severity, expectedAcKw: expected, actualAcKw: actual, differenceKw: actual - expected, performanceRatio: ratio, underperformancePercent: underperformance, persistent, persistedMinutes: Math.round(persistedMinutes), causes, dataNotes };
}
