import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseSolar, type DoctorInput, type DoctorSample } from "./solar-doctor";

const now = Date.parse("2026-08-09T12:00:00Z");
function history(ratio: number, options: Partial<DoctorSample> = {}): DoctorSample[] {
  return [10, 5, 0].map((minutes) => ({ time: now - minutes * 60_000, expectedKw: 4.8, actualKw: 4.8 * ratio, irradiance: 820, cloudCover: 10, rain: false, ...options }));
}
function input(overrides: Partial<DoctorInput> = {}): DoctorInput {
  return { now, expectedAcKw: 5, actualAcKw: 4.8, panelCapacityKw: 7.25, inverterMaxAcKw: 5, irradiance: 820, previousIrradiance: 830, cloudCover: 10, temperatureC: 34, rain: false, weatherCode: 0, gridConnected: true, statusCode: 3, faultCode: 0, warningCode: 0, history: [], ...overrides };
}

test("healthy system is not flagged", () => { assert.equal(diagnoseSolar(input()).status, "normal_clipping"); });
test("weather drop outranks hardware causes", () => { const result = diagnoseSolar(input({ inverterMaxAcKw: 8, expectedAcKw: 4.8, actualAcKw: 3, irradiance: 260, previousIrradiance: 800, cloudCover: 85, history: history(0.62, { irradiance: 260, cloudCover: 85 }) })); assert.equal(result.causes[0].cause, "weather"); assert.notEqual(result.severity, "critical"); });
test("normal inverter clipping is not a fault", () => { const result = diagnoseSolar(input({ expectedAcKw: 5, actualAcKw: 5, panelCapacityKw: 6.5, inverterMaxAcKw: 5 })); assert.equal(result.status, "normal_clipping"); assert.equal(result.causes[0].cause, "normalClipping"); });
test("persistent clear-weather underperformance becomes a possible issue", () => { const result = diagnoseSolar(input({ inverterMaxAcKw: 8, expectedAcKw: 4.8, actualAcKw: 3.1, history: history(0.65) })); assert.equal(result.status, "possible_issue"); assert.equal(result.persistent, true); assert.ok(result.causes.some((cause) => cause.cause === "soiling" && cause.score >= 0.6)); });
test("a single low reading is not called a serious issue", () => { const result = diagnoseSolar(input({ inverterMaxAcKw: 8, expectedAcKw: 4.8, actualAcKw: 2.5, history: [] })); assert.equal(result.status, "slightly_low"); assert.equal(result.persistent, false); });
test("sudden shutdown with inverter fault is critical", () => { const result = diagnoseSolar(input({ inverterMaxAcKw: 8, expectedAcKw: 4.5, actualAcKw: 0, faultCode: 17, history: history(0) })); assert.equal(result.severity, "critical"); assert.equal(result.causes[0].cause, "inverter"); });
test("high temperature is treated as an explanation, not a fault", () => { const result = diagnoseSolar(input({ inverterMaxAcKw: 8, expectedAcKw: 4.8, actualAcKw: 3.8, temperatureC: 52, history: history(0.79) })); assert.ok(result.causes.some((cause) => cause.cause === "temperature" && cause.score > 0.5)); assert.notEqual(result.severity, "critical"); });
test("repeated clear-weather drops at the same time increase shading probability", () => {
  const repeated = [1, 2, 3].flatMap((days) => history(0.62).map((sample) => ({ ...sample, time: sample.time - days * 86400000 })));
  const result = diagnoseSolar(input({ inverterMaxAcKw: 8, expectedAcKw: 4.8, actualAcKw: 3, history: [...repeated, ...history(0.62)] }));
  assert.ok(result.causes.some((cause) => cause.cause === "shading" && cause.score >= 0.8));
});
