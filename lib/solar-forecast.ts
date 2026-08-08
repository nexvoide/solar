export type PanelOrientation = "north" | "south" | "east" | "west" | "south-east" | "south-west";
export type SolarSystemType = "off-grid" | "hybrid" | "net-metering";

export interface SolarForecastSettings {
  locationName: string;
  latitude: number;
  longitude: number;
  locationAccuracy?: number;
  panels: number;
  panelWattage: number;
  orientation: PanelOrientation;
  roofTilt: number;
  systemType: SolarSystemType;
  systemEfficiency: number;
}

export interface Appliance {
  id: string;
  name: string;
  watts: number;
  quantity: number;
}

export interface WeatherHour {
  time: string;
  temperature: number;
  humidity: number;
  cloudCover: number;
  precipitationProbability: number;
  windSpeed: number;
  uvIndex: number;
  weatherCode: number;
  irradiance: number;
  tiltedIrradiance: number | null;
}

export interface ForecastHour extends WeatherHour {
  outputKw: number;
  condition: string;
}

export interface CurrentWeatherObservation {
  time?: string | number;
  temperature_2m?: string | number;
  relative_humidity_2m?: string | number;
  cloud_cover?: string | number;
  precipitation?: string | number;
  rain?: string | number;
  showers?: string | number;
  weather_code?: string | number;
  wind_speed_10m?: string | number;
  shortwave_radiation?: string | number;
}

export const DEFAULT_APPLIANCES: Appliance[] = [
  { id: "inverter-ac", name: "Inverter AC 1.5 Ton", watts: 1000, quantity: 1 },
  { id: "non-inverter-ac", name: "Non Inverter AC", watts: 1800, quantity: 1 },
  { id: "refrigerator", name: "Refrigerator", watts: 180, quantity: 1 },
  { id: "water-pump", name: "Water Pump", watts: 750, quantity: 1 },
  { id: "fan", name: "Fan", watts: 80, quantity: 5 },
  { id: "led-light", name: "LED Light", watts: 15, quantity: 5 },
  { id: "laptop", name: "Laptop", watts: 80, quantity: 1 },
  { id: "desktop", name: "Desktop PC", watts: 250, quantity: 1 },
  { id: "washing-machine", name: "Washing Machine", watts: 700, quantity: 1 },
  { id: "microwave", name: "Microwave", watts: 1200, quantity: 1 },
  { id: "iron", name: "Electric Iron", watts: 1000, quantity: 1 },
];

export const ORIENTATION_AZIMUTH: Record<PanelOrientation, number> = {
  south: 0,
  "south-east": -45,
  east: -90,
  "south-west": 45,
  west: 90,
  north: 180,
};

function observedNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Replace the nearest forecast hour with the latest measured weather. */
export function mergeCurrentWeatherObservation(
  hours: WeatherHour[],
  current: CurrentWeatherObservation | undefined,
  referenceTime: string,
): WeatherHour[] {
  if (!hours.length || !current) return hours;
  const observedTime = current.time ? new Date(current.time).getTime() : new Date(referenceTime).getTime();
  if (!Number.isFinite(observedTime)) return hours;
  let nearestIndex = 0;
  for (let index = 1; index < hours.length; index += 1) {
    if (Math.abs(new Date(hours[index].time).getTime() - observedTime) < Math.abs(new Date(hours[nearestIndex].time).getTime() - observedTime)) nearestIndex = index;
  }
  const precipitation = observedNumber(current.precipitation) ?? 0;
  const rain = observedNumber(current.rain) ?? 0;
  const showers = observedNumber(current.showers) ?? 0;
  const isRainingNow = precipitation > 0 || rain > 0 || showers > 0;
  const valueOr = (value: string | number | undefined, fallback: number) => observedNumber(value) ?? fallback;

  return hours.map((hour, index) => index !== nearestIndex ? hour : {
    ...hour,
    temperature: valueOr(current.temperature_2m, hour.temperature),
    humidity: valueOr(current.relative_humidity_2m, hour.humidity),
    cloudCover: valueOr(current.cloud_cover, hour.cloudCover),
    precipitationProbability: isRainingNow ? Math.max(95, hour.precipitationProbability) : hour.precipitationProbability,
    weatherCode: valueOr(current.weather_code, hour.weatherCode),
    windSpeed: valueOr(current.wind_speed_10m, hour.windSpeed),
    irradiance: valueOr(current.shortwave_radiation, hour.irradiance),
    tiltedIrradiance: current.shortwave_radiation === undefined ? hour.tiltedIrradiance : valueOr(current.shortwave_radiation, hour.irradiance),
  });
}

const ORIENTATION_FACTOR: Record<PanelOrientation, number> = {
  south: 1,
  "south-east": 0.96,
  "south-west": 0.96,
  east: 0.9,
  west: 0.9,
  north: 0.75,
};

function cloudFactor(cloud: number): number {
  const points = [[0, 1], [20, 0.95], [40, 0.8], [60, 0.6], [80, 0.35], [100, 0.15]];
  const bounded = Math.max(0, Math.min(100, cloud));
  for (let i = 1; i < points.length; i += 1) {
    if (bounded <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((bounded - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 0.15;
}

function rainFactor(hour: WeatherHour): number {
  const probability = Math.max(0, Math.min(100, hour.precipitationProbability));
  const code = hour.weatherCode;
  if (code >= 95 || probability >= 90) return 0.03;
  if (code >= 80 || probability >= 75) return 0.1;
  if (code >= 60 || probability >= 50) return 0.25;
  if (code >= 51 || probability >= 30) return 0.45;
  if (probability >= 15) return 0.7;
  return 1;
}

/**
 * A weather service can occasionally report high irradiance alongside rain.
 * Keep those contradictory inputs from producing an unsafe, optimistic result.
 */
function severeWeatherCapacityLimit(hour: WeatherHour): number {
  const rain = Math.max(0, Math.min(100, hour.precipitationProbability));
  const cloud = Math.max(0, Math.min(100, hour.cloudCover));
  const code = hour.weatherCode;

  if (code >= 95 || rain >= 90) return 0.05;
  if (code >= 80 || rain >= 75) return 0.12;
  if (code >= 60 || rain >= 60) return 0.2;
  if (code >= 51 || rain >= 45) return 0.35;
  if (cloud >= 90) return 0.2;
  if (cloud >= 80) return 0.3;
  if (cloud >= 70) return 0.45;
  return 1;
}

function hasSevereWeather(hour: WeatherHour): boolean {
  return severeWeatherCapacityLimit(hour) < 1;
}

function sunlightFactor(time: number, sunrise: number, sunset: number): number {
  const dayLength = sunset - sunrise;
  if (dayLength <= 0) return 0;

  const twilightWindow = 90 * 60_000;
  if (time < sunrise - twilightWindow || time > sunset + twilightWindow) return 0;

  const progress = (time - sunrise) / dayLength;
  if (progress <= 0 || progress >= 1) return 0.015;
  return Math.max(0.015, Math.sin(Math.PI * progress));
}

function temperatureFactor(temp: number): number {
  if (temp <= 25) return 1;
  return Math.max(0.75, 1 - (temp - 25) * 0.008);
}

export function weatherCondition(code: number, cloud: number, rain: number): string {
  if (code >= 95) return "Thunderstorm";
  if (code >= 80 || rain >= 60) return "Rain likely";
  if (code >= 51) return "Rain possible";
  if (code >= 45) return "Foggy";
  if (cloud >= 75) return "Cloudy";
  if (cloud >= 30) return "Partly cloudy";
  return "Sunny";
}

export function calculateForecast(
  settings: SolarForecastSettings,
  weather: WeatherHour[],
  sunrise: string,
  sunset: string,
  calibration: number,
): ForecastHour[] {
  const capacityKw = (settings.panels * settings.panelWattage) / 1000;
  const start = new Date(sunrise).getTime();
  const end = new Date(sunset).getTime();

  return weather
    .filter((hour) => {
      const time = new Date(hour.time).getTime();
      return time >= start - 60 * 60_000 && time <= end;
    })
    .map((hour) => {
      const time = new Date(hour.time).getTime();
      const hasTilted = hour.tiltedIrradiance !== null && hour.tiltedIrradiance >= 0;
      const irradianceFactor = Math.max(0, (hasTilted ? hour.tiltedIrradiance! : hour.irradiance) / 1000);
      const weatherFactor = cloudFactor(hour.cloudCover) * rainFactor(hour) * ORIENTATION_FACTOR[settings.orientation];
      const sunFactor = sunlightFactor(time, start, end);
      const weatherCapacityKw = capacityKw * severeWeatherCapacityLimit(hour);
      const outputKw = Math.min(
        capacityKw,
        weatherCapacityKw,
        capacityKw * irradianceFactor * weatherFactor * sunFactor * temperatureFactor(hour.temperature) *
          (settings.systemEfficiency / 100) * calibration,
      );
      return {
        ...hour,
        outputKw: Math.max(0, outputKw),
        condition: weatherCondition(hour.weatherCode, hour.cloudCover, hour.precipitationProbability),
      };
    });
}

export function applyRealtimeAdjustment(
  hours: ForecastHour[],
  referenceTime: string,
  actualOutputKw: number,
): ForecastHour[] {
  if (!hours.length || actualOutputKw <= 0.05) return hours;

  const referenceMs = new Date(referenceTime).getTime();
  const currentHour = hours.reduce<ForecastHour | null>((best, hour) => {
    if (!best) return hour;
    const distance = Math.abs(new Date(hour.time).getTime() - referenceMs);
    const bestDistance = Math.abs(new Date(best.time).getTime() - referenceMs);
    return distance < bestDistance ? hour : best;
  }, null);

  if (!currentHour || currentHour.outputKw <= 0.05) return hours;

  const ratio = Math.max(0.35, Math.min(1.65, actualOutputKw / currentHour.outputKw));
  const now = new Date(referenceTime).getTime();

  return hours.map((hour) => {
    const hourTime = new Date(hour.time).getTime();
    const distanceHours = Math.abs(hourTime - now) / (60 * 60 * 1000);
    const weight = Math.max(0.15, Math.exp(-distanceHours / 3));
    // A sunny live reading must not inflate a later rainy/cloudy hour above its
    // weather-limited forecast. Severe weather may still pull the result down.
    const blendedRatio = hasSevereWeather(hour)
      ? Math.min(1, 1 - weight + weight * ratio)
      : 1 - weight + weight * ratio;
    const adjustedOutput = Math.max(0, hour.outputKw * blendedRatio);

    return {
      ...hour,
      outputKw: adjustedOutput,
    };
  });
}

export function availability(outputKw: number, capacityKw: number) {
  const ratio = capacityKw > 0 ? outputKw / capacityKw : 0;
  if (ratio >= 0.65) return { label: "Excellent", color: "emerald", message: "Enough solar for heavy appliances" };
  if (ratio >= 0.3) return { label: "Moderate", color: "amber", message: "Avoid starting additional heavy loads" };
  return { label: "Low", color: "red", message: "Run essential appliances only" };
}

export function parsePowerKw(value: string, unit: string): number | null {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return null;
  return unit.toLowerCase() === "w" ? number / 1000 : number;
}
