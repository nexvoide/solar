export interface VoiceToolContext {
  current?: { solarKw?: unknown; loadKw?: unknown; gridKw?: unknown; gridConnected?: unknown; todayEnergyKwh?: unknown; expectedSolarKw?: unknown; timestamp?: unknown; statusText?: unknown; faultCode?: unknown; warningCode?: unknown };
  forecast?: { todayEnergyKwh?: unknown; tomorrowEnergyKwh?: unknown; todayPeakKw?: unknown; tomorrowPeakKw?: unknown; bestHours?: unknown; todayHourly?: unknown };
  weather?: { current?: unknown; today?: unknown; tomorrow?: unknown };
  health?: unknown;
  doctor?: unknown;
  appliances?: unknown;
  system?: unknown;
  history?: unknown;
}

export interface VoiceToolResult { tool: string; data: unknown; }

const finite = (value: unknown, min = -1000, max = 100000): number | null => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Number(value.toFixed(3)) : null;
const short = (value: unknown, max = 300): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;

/** Converts client-held application state into bounded, read-only tool results. */
export function buildVoiceToolResults(input: VoiceToolContext): VoiceToolResult[] {
  const current = input.current ?? {};
  const forecast = input.forecast ?? {};
  const results: VoiceToolResult[] = [
    { tool: "getCurrentSolarPower", data: { currentPowerKw: finite(current.solarKw, 0), expectedPowerKw: finite(current.expectedSolarKw, 0), timestamp: short(current.timestamp, 60) } },
    { tool: "getTodaySolarGeneration", data: { generatedSoFarKwh: finite(current.todayEnergyKwh, 0), expectedTodayKwh: finite(forecast.todayEnergyKwh, 0), peakKw: finite(forecast.todayPeakKw, 0) } },
    { tool: "getTodayHourlySolarForecast", data: Array.isArray(forecast.todayHourly) ? forecast.todayHourly.slice(0, 18).map((entry) => { const hour = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; return { time: short(hour.time, 40), solarKw: finite(hour.solarKw, 0), condition: short(hour.condition, 60), rainChancePercent: finite(hour.rainChancePercent, 0, 100), cloudCoverPercent: finite(hour.cloudCoverPercent, 0, 100), temperatureC: finite(hour.temperatureC, -30, 70) }; }) : [] },
    { tool: "getTomorrowSolarForecast", data: { expectedEnergyKwh: finite(forecast.tomorrowEnergyKwh, 0), peakKw: finite(forecast.tomorrowPeakKw, 0), bestHours: Array.isArray(forecast.bestHours) ? forecast.bestHours.slice(0, 6).map((item) => short(item, 40)).filter(Boolean) : [] } },
    { tool: "getEnergyConsumption", data: { currentLoadKw: finite(current.loadKw, 0), recentHistory: Array.isArray(input.history) ? input.history.slice(-24) : [] } },
    { tool: "getBatteryStatus", data: { available: false, message: "Data unavailable. This inverter feed does not expose battery telemetry." } },
    { tool: "getGridStatus", data: { connected: typeof current.gridConnected === "boolean" ? current.gridConnected : null, gridPowerKw: finite(current.gridKw), status: short(current.statusText, 100) } },
    { tool: "getCurrentWeather", data: input.weather?.current ?? { available: false, message: "Data unavailable." } },
    { tool: "getTodayWeather", data: input.weather?.today ?? { available: false, message: "Data unavailable." } },
    { tool: "getSolarHealth", data: input.health ?? { available: false, message: "Data unavailable." } },
    { tool: "getSolarDoctorDiagnosis", data: input.doctor ?? { available: false, message: "Data unavailable." } },
    { tool: "getApplianceSchedule", data: input.appliances ?? { available: false, message: "Data unavailable." } },
    { tool: "getSystemConfiguration", data: input.system ?? { available: false, message: "Data unavailable." } },
  ];
  return results;
}

export const VOICE_SYSTEM_INSTRUCTION = `You are Noor, the AI Energy Assistant inside a solar energy monitoring application. If the user asks your name, say Noor. You communicate naturally using concise spoken conversation. Understand Urdu script, Roman Urdu, English, and mixed Urdu-English, and answer in the same style as the user. The supplied TOOL RESULTS are the only source of application-specific facts. Never invent or extrapolate solar, forecast, weather, battery, grid, appliance, consumption, savings, or inverter values. If a requested field is null, absent, or marked unavailable, say it is currently unavailable. Do not claim that you called a tool not present in TOOL RESULTS. Preserve conversational context from prior turns. Use natural Pakistani Urdu or Roman Urdu, not formal translation-like wording. Do not read JSON or large tables. For a morning briefing, give a useful spoken overview covering current weather, today's total solar estimate, peak solar and best hours, then a chronological hour-by-hour summary of meaningful daylight changes. State solar kW at key hours such as 1 PM, describe rain or cloud risk, identify specific low-generation hours, and end with one practical appliance-use suggestion. Skip repetitive hours when conditions are similar, but never invent missing hourly values. You are an energy assistant, not an electrician. Never instruct users to open, modify, disconnect, bypass, or repair electrical equipment; recommend a qualified solar technician when supported fault evidence requires it.`;
