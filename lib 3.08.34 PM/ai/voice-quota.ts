export interface VoiceLimits { maxSessions: number; maxSessionSeconds: number; maxSilenceSeconds: number; maxDailySeconds: number; }
interface Usage { day: string; sessions: number; seconds: number; active: Map<string, number>; }

const usage = new Map<string, Usage>();
const positiveInt = (value: string | undefined, fallback: number) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; };

export function voiceLimits(): VoiceLimits {
  return { maxSessions: positiveInt(process.env.MAX_VOICE_SESSIONS_PER_USER_PER_DAY, 5), maxSessionSeconds: positiveInt(process.env.MAX_VOICE_SESSION_SECONDS, 120), maxSilenceSeconds: positiveInt(process.env.MAX_SILENCE_SECONDS, 30), maxDailySeconds: positiveInt(process.env.MAX_DAILY_VOICE_DURATION_SECONDS, 600) };
}

export function consumeVoiceQuota(userId: string, sessionId: string, durationSeconds: number, now = Date.now()): { ok: true; limits: VoiceLimits; remainingSessions: number; remainingSeconds: number } | { ok: false; code: "daily_limit" | "session_limit"; limits: VoiceLimits } {
  const limits = voiceLimits();
  const day = new Date(now).toISOString().slice(0, 10);
  let record = usage.get(userId);
  if (!record || record.day !== day) { record = { day, sessions: 0, seconds: 0, active: new Map() }; usage.set(userId, record); }
  const startedAt = record.active.get(sessionId);
  if (!startedAt) {
    if (record.sessions >= limits.maxSessions) return { ok: false, code: "daily_limit", limits };
    record.sessions += 1;
    record.active.set(sessionId, now);
  } else if ((now - startedAt) / 1000 >= limits.maxSessionSeconds) return { ok: false, code: "session_limit", limits };
  const safeDuration = Math.max(0, Math.min(durationSeconds, limits.maxSessionSeconds));
  if (record.seconds + safeDuration > limits.maxDailySeconds) return { ok: false, code: "daily_limit", limits };
  record.seconds += safeDuration;
  return { ok: true, limits, remainingSessions: Math.max(0, limits.maxSessions - record.sessions), remainingSeconds: Math.max(0, limits.maxDailySeconds - record.seconds) };
}

export function resetVoiceQuotaForTests() { usage.clear(); }
