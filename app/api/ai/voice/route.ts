import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/knox-session";
import { buildVoiceToolResults, VOICE_SYSTEM_INSTRUCTION, type VoiceToolContext } from "@/lib/ai/voice-tools";
import { consumeVoiceQuota, voiceLimits } from "@/lib/ai/voice-quota";

export const dynamic = "force-dynamic";
const DEFAULT_FREE_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_FREE_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const MAX_AUDIO_BYTES = 7_000_000;

function clean(value: unknown, max: number): string | null { if (typeof value !== "string") return null; const result = value.trim().replace(/\s+/g, " "); return result && result.length <= max ? result : null; }
function userId(request: Request): string | null { const state = readSessionCookie(request.headers.get("cookie")); if (!state) return null; return crypto.createHash("sha256").update(`${state.connection.pn}:${state.device.sn}`).digest("hex"); }

async function synthesizeNoor(apiKey: string, transcript: string, language: string) {
  const model = process.env.GEMINI_TTS_MODEL ?? DEFAULT_FREE_TTS_MODEL;
  if (model !== DEFAULT_FREE_TTS_MODEL && process.env.GEMINI_VOICE_FREE_TIER_VERIFIED !== "true") return null;
  const style = language === "urdu" ? "Speak natural conversational Pakistani Urdu with clear pronunciation." : language === "roman_urdu" ? "Speak natural conversational Roman Urdu with a Pakistani accent; pronounce Urdu words as Urdu, not English." : language === "mixed" ? "Speak naturally in mixed Pakistani Urdu and English, switching smoothly between both." : "Speak clear, warm conversational English.";
  const body = { model, input: `Synthesize only the transcript below. Do not read these directions aloud. Use a warm, friendly female energy-assistant voice at a relaxed natural pace. ${style}\n\nTRANSCRIPT:\n${transcript}`, response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: process.env.GEMINI_TTS_VOICE ?? "Kore" }] } };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, "Api-Revision": "2026-05-20" }, body: JSON.stringify(body) });
      if (!response.ok) { console.error("[Noor Voice] Gemini TTS failed", response.status); continue; }
      const result = await response.json() as { steps?: Array<{ content?: Array<{ type?: string; data?: string; sample_rate?: number; mime_type?: string }> }> };
      const audio = result.steps?.flatMap((step) => step.content ?? []).find((content) => content.type === "audio" && content.data);
      if (audio?.data) return { data: audio.data, sampleRate: audio.sample_rate ?? 24_000, mimeType: audio.mime_type ?? "audio/pcm" };
    } catch (error) { console.error("[Noor Voice] Gemini TTS error", error instanceof Error ? error.message : "unknown"); }
  }
  return null;
}

function configuredModel(): { model: string; freeTierVerified: boolean } {
  const model = process.env.GEMINI_VOICE_MODEL ?? DEFAULT_FREE_MODEL;
  return { model, freeTierVerified: model === DEFAULT_FREE_MODEL || process.env.GEMINI_VOICE_FREE_TIER_VERIFIED === "true" };
}

export async function GET() { const configured = configuredModel(); return NextResponse.json({ limits: voiceLimits(), modelConfigured: Boolean(process.env.GEMINI_API_KEY) && configured.freeTierVerified, ...configured }, { headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  const id = userId(request);
  if (!id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice assistant is not configured" }, { status: 503 });
  const configured = configuredModel();
  if (!configured.freeTierVerified) return NextResponse.json({ error: "Free-tier compatibility needs to be verified.", code: "model_not_verified" }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (body.action === "synthesize") {
    const transcript = clean(body.transcript, 900);
    const language = clean(body.language, 20) ?? "mixed";
    if (!transcript) return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    const speech = await synthesizeNoor(apiKey, transcript, language);
    return speech ? NextResponse.json({ speech }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Natural voice is temporarily unavailable" }, { status: 503 });
  }
  const sessionId = clean(body.sessionId, 100); const duration = typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds) ? body.durationSeconds : 0;
  if (!sessionId || duration < 0) return NextResponse.json({ error: "Invalid voice session" }, { status: 400 });
  const configuredLimits = voiceLimits();
  if (duration > configuredLimits.maxSessionSeconds) return NextResponse.json({ error: "Voice session ended.", code: "session_limit" }, { status: 429 });
  const quota = consumeVoiceQuota(id, sessionId, duration);
  if (!quota.ok) return NextResponse.json({ error: quota.code === "daily_limit" ? "Voice assistant limit reached for today. Please try again tomorrow." : "Voice session ended.", code: quota.code }, { status: 429 });

  const audio = clean(body.audio, MAX_AUDIO_BYTES * 1.4); const query = clean(body.query, 500);
  if (!audio && !query) return NextResponse.json({ error: "Audio or query is required" }, { status: 400 });
  if (audio && Buffer.byteLength(audio, "base64") > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Voice message is too large" }, { status: 413 });
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const tools = buildVoiceToolResults((body.context && typeof body.context === "object" ? body.context : {}) as VoiceToolContext);
  const requestedLanguage = ["auto", "urdu", "roman_urdu", "english"].includes(String(body.language)) ? String(body.language) : "auto";
  const prompt = `${VOICE_SYSTEM_INSTRUCTION}\n\nVOICE LANGUAGE SETTING: ${requestedLanguage}. When this is not auto, answer in that language.\n\nTOOL RESULTS:\n${JSON.stringify(tools)}\n\nCONVERSATION HISTORY:\n${JSON.stringify(history)}\n\n${query ? `USER REQUEST: ${query}` : "Transcribe the attached user audio accurately, then answer it."}\nReturn JSON only with transcript, response, and language (urdu, roman_urdu, english, or mixed).`;
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (audio) parts.push({ inlineData: { mimeType: clean(body.mimeType, 80) ?? "audio/webm", data: audio } });
  const model = configured.model;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(25_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          maxOutputTokens: 320, responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { transcript: { type: "STRING" }, response: { type: "STRING" }, language: { type: "STRING", enum: ["urdu", "roman_urdu", "english", "mixed"] } },
            required: ["transcript", "response", "language"],
          },
        },
      }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { error?: { status?: string; message?: string } } | null;
      console.error("[Noor Voice] Gemini request failed", response.status, failure?.error?.status, failure?.error?.message);
      const unavailableModel = response.status === 404 || failure?.error?.status === "NOT_FOUND";
      return NextResponse.json({ error: response.status === 429 ? "Voice AI is temporarily unavailable because today's free voice limit has been reached." : unavailableModel ? "Noor's configured Free Tier model is unavailable. Please update GEMINI_VOICE_MODEL." : "Voice assistant is temporarily unavailable. Please try again.", code: response.status === 429 ? "gemini_quota" : unavailableModel ? "model_unavailable" : "gemini_unavailable" }, { status: 503 });
    }
    const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text; if (!raw) throw new Error("Empty response");
    const parsed = JSON.parse(raw) as Record<string, unknown>; const transcript = clean(parsed.transcript, 500) ?? query; const answer = clean(parsed.response, 900); const language = parsed.language;
    if (!transcript || !answer || !["urdu", "roman_urdu", "english", "mixed"].includes(String(language))) throw new Error("Invalid response");
    return NextResponse.json({ transcript, response: answer, language, quota: { remainingSessions: quota.remainingSessions, remainingSeconds: quota.remainingSeconds } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Voice assistant is temporarily unavailable. Please try again.", code: "invalid_response" }, { status: 503 }); }
}
