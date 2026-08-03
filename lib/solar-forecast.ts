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
      const hasTilted = hour.tiltedIrradiance !== null && hour.tiltedIrradiance >= 0;
      const irradianceFactor = Math.max(0, (hasTilted ? hour.tiltedIrradiance! : hour.irradiance) / 1000);
      const fallbackWeatherFactor = hasTilted
        ? 1
        : cloudFactor(hour.cloudCover) * ORIENTATION_FACTOR[settings.orientation];
      const outputKw = Math.min(
        capacityKw,
        capacityKw * irradianceFactor * fallbackWeatherFactor * temperatureFactor(hour.temperature) *
          (settings.systemEfficiency / 100) * calibration,
      );
      return {
        ...hour,
        outputKw: Math.max(0, outputKw),
        condition: weatherCondition(hour.weatherCode, hour.cloudCover, hour.precipitationProbability),
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
