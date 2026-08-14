import assert from "node:assert/strict";
import test from "node:test";
import { buildVoiceToolResults } from "./ai/voice-tools";
import { consumeVoiceQuota, resetVoiceQuotaForTests } from "./ai/voice-quota";

test("voice tools preserve real current solar values and mark battery unavailable", () => {
  const tools = buildVoiceToolResults({ current: { solarKw: 4.32, expectedSolarKw: 4.75 } });
  assert.deepEqual(tools.find((item) => item.tool === "getCurrentSolarPower")?.data, { currentPowerKw: 4.32, expectedPowerKw: 4.75, timestamp: null });
  assert.equal((tools.find((item) => item.tool === "getBatteryStatus")?.data as { available: boolean }).available, false);
});

test("morning briefing receives bounded hourly solar and weather details", () => {
  const tools = buildVoiceToolResults({ forecast: { todayHourly: [{ time: "2026-08-14T13:00:00+05:00", solarKw: 3.27, condition: "Light rain", rainChancePercent: 72, cloudCoverPercent: 84, temperatureC: 31 }] } });
  assert.deepEqual(tools.find((item) => item.tool === "getTodayHourlySolarForecast")?.data, [{ time: "2026-08-14T13:00:00+05:00", solarKw: 3.27, condition: "Light rain", rainChancePercent: 72, cloudCoverPercent: 84, temperatureC: 31 }]);
});

test("voice quota blocks a sixth daily session by default", () => {
  resetVoiceQuotaForTests();
  for (let index = 0; index < 5; index += 1) assert.equal(consumeVoiceQuota("user", `session-${index}`, 1, 1_700_000_000_000).ok, true);
  assert.deepEqual(consumeVoiceQuota("user", "session-6", 1, 1_700_000_000_000).ok, false);
});
