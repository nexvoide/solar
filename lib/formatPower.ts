import type { UnitPreference } from "./i18n/translations";

/** Normalize any power reading to kilowatts. */
export function toKw(value: string, unit: string): number | null {
  if (value === "—") return null;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return null;

  const u = unit.toLowerCase();
  if (u === "kw") return num;
  if (u === "w") return num / 1000;
  return num;
}

/** Format power for display using the user's unit preference (default: kW). */
export function formatPower(
  value: string,
  unit: string,
  preference: UnitPreference,
): string {
  const kw = toKw(value, unit);
  if (kw === null) return value === "—" ? "—" : `${value} ${unit}`.trim();

  return formatPowerKw(kw, preference);
}

/** Format a value that is already normalized to kilowatts. */
export function formatPowerKw(kw: number, preference: UnitPreference): string {
  const normalizedKw = Math.abs(kw) < 0.02 ? 0 : kw;

  if (preference === "kW") {
    return `${normalizedKw.toFixed(2)} kW`;
  }
  if (preference === "W") {
    return `${(normalizedKw * 1000).toFixed(0)} W`;
  }

  // auto: show kW when ≥ 1, otherwise W
  if (Math.abs(normalizedKw) >= 1) return `${normalizedKw.toFixed(2)} kW`;
  return `${(normalizedKw * 1000).toFixed(0)} W`;
}
