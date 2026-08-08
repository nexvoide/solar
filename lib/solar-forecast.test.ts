import assert from "node:assert/strict";
import test from "node:test";
import { applyRealtimeAdjustment, calculateForecast, mergeCurrentWeatherObservation, type ForecastHour, type SolarForecastSettings, type WeatherHour } from "./solar-forecast";
import { formatPowerKw } from "./formatPower";

function buildWeather(overrides: Partial<WeatherHour>): WeatherHour {
  return {
    time: "2026-08-08T12:00:00.000Z",
    temperature: 30,
    humidity: 65,
    cloudCover: 10,
    precipitationProbability: 0,
    windSpeed: 5,
    uvIndex: 7,
    weatherCode: 0,
    irradiance: 1000,
    tiltedIrradiance: 1000,
    ...overrides,
  };
}

test("tiny readings are displayed as zero to avoid noisy values", () => {
  assert.equal(formatPowerKw(0.019, "W"), "0 W");
  assert.equal(formatPowerKw(0.019, "kW"), "0.00 kW");
});

test("near sunrise still produces a tiny positive solar value", () => {
  const settings: SolarForecastSettings = {
    locationName: "Test",
    latitude: 0,
    longitude: 0,
    panels: 8,
    panelWattage: 450,
    orientation: "south",
    roofTilt: 30,
    systemType: "net-metering",
    systemEfficiency: 95,
  };

  const twilight = calculateForecast(settings, [buildWeather({ time: "2026-08-08T06:30:00.000Z", irradiance: 80, tiltedIrradiance: 80, cloudCover: 10, precipitationProbability: 0 })], "2026-08-08T06:00:00.000Z", "2026-08-08T20:00:00.000Z", 1)[0];

  assert.ok(twilight.outputKw > 0, `expected tiny twilight production, got ${twilight.outputKw}`);
});

test("live production adjusts the forecast toward observed output", () => {
  const hours: ForecastHour[] = [
    {
      ...buildWeather({ time: "2026-08-08T12:00:00.000Z", irradiance: 1000, tiltedIrradiance: 1000, cloudCover: 10, precipitationProbability: 0 }),
      outputKw: 2.5,
      condition: "Sunny",
    },
    {
      ...buildWeather({ time: "2026-08-08T13:00:00.000Z", irradiance: 980, tiltedIrradiance: 980, cloudCover: 15, precipitationProbability: 5 }),
      outputKw: 2.4,
      condition: "Partly cloudy",
    },
  ];

  const adjusted = applyRealtimeAdjustment(hours, "2026-08-08T12:00:00.000Z", 1.2);

  assert.ok(adjusted[0].outputKw < 2.5, `expected current hour to be pulled down by live data, got ${adjusted[0].outputKw}`);
  assert.ok(adjusted[1].outputKw < 2.4, `expected later hours to soften toward the new reality, got ${adjusted[1].outputKw}`);
});

test("rainy conditions reduce solar forecast much more aggressively", () => {
  const settings: SolarForecastSettings = {
    locationName: "Test",
    latitude: 0,
    longitude: 0,
    panels: 8,
    panelWattage: 450,
    orientation: "south",
    roofTilt: 30,
    systemType: "net-metering",
    systemEfficiency: 95,
  };

  const clear = calculateForecast(settings, [buildWeather({})], "2026-08-08T06:00:00.000Z", "2026-08-08T20:00:00.000Z", 1)[0];
  const rainy = calculateForecast(settings, [buildWeather({ cloudCover: 85, precipitationProbability: 90, weatherCode: 80, irradiance: 900, tiltedIrradiance: 900 })], "2026-08-08T06:00:00.000Z", "2026-08-08T20:00:00.000Z", 1)[0];

  assert.ok(clear.outputKw > 2.5, `expected clear forecast to be high, got ${clear.outputKw}`);
  assert.ok(rainy.outputKw < clear.outputKw * 0.25, `expected rain to reduce output heavily, got ${rainy.outputKw} vs ${clear.outputKw}`);
});

test("heavy rain cannot produce an unrealistic multi-kilowatt forecast", () => {
  const settings: SolarForecastSettings = {
    locationName: "Test", latitude: 0, longitude: 0, panels: 20, panelWattage: 500,
    orientation: "south", roofTilt: 30, systemType: "net-metering", systemEfficiency: 100,
  };
  const rainy = calculateForecast(settings, [buildWeather({
    cloudCover: 70, precipitationProbability: 80, weatherCode: 80,
    irradiance: 1000, tiltedIrradiance: 1000,
  })], "2026-08-08T06:00:00.000Z", "2026-08-08T20:00:00.000Z", 1.2)[0];

  assert.ok(rainy.outputKw <= 1.2, `10 kW array must stay at or below 1.2 kW in heavy rain, got ${rainy.outputKw}`);
});

test("thunderstorms cap output at five percent of array capacity", () => {
  const settings: SolarForecastSettings = {
    locationName: "Test", latitude: 0, longitude: 0, panels: 20, panelWattage: 500,
    orientation: "south", roofTilt: 30, systemType: "net-metering", systemEfficiency: 100,
  };
  const storm = calculateForecast(settings, [buildWeather({
    cloudCover: 95, precipitationProbability: 95, weatherCode: 95,
    irradiance: 1000, tiltedIrradiance: 1000,
  })], "2026-08-08T06:00:00.000Z", "2026-08-08T20:00:00.000Z", 1.2)[0];

  assert.ok(storm.outputKw <= 0.5, `10 kW array must stay at or below 0.5 kW in a storm, got ${storm.outputKw}`);
});

test("live adjustment never inflates a severe-weather hour", () => {
  const rainyHour: ForecastHour = {
    ...buildWeather({ cloudCover: 85, precipitationProbability: 80, weatherCode: 80 }),
    outputKw: 0.8, condition: "Rain likely",
  };
  const adjusted = applyRealtimeAdjustment([rainyHour], rainyHour.time, 4);

  assert.equal(adjusted[0].outputKw, rainyHour.outputKw);
});

test("sudden observed rain immediately overrides the current forecast hour", () => {
  const hours = [buildWeather({ time: "2026-08-08T12:00:00.000Z", precipitationProbability: 5, cloudCover: 10, weatherCode: 0 })];
  const merged = mergeCurrentWeatherObservation(hours, {
    time: "2026-08-08T12:04:00.000Z", precipitation: 1.2, rain: 1.2,
    cloud_cover: 95, weather_code: 63, shortwave_radiation: 80,
  }, "2026-08-08T12:04:00.000Z");

  assert.equal(merged[0].precipitationProbability, 95);
  assert.equal(merged[0].cloudCover, 95);
  assert.equal(merged[0].weatherCode, 63);
  assert.equal(merged[0].irradiance, 80);
});
