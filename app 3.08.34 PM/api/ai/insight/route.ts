import { NextResponse } from "next/server";
import type { EnergyInsight, InsightReading, InsightSeverity } from "@/lib/ai-insight";

export const dynamic = "force-dynamic";

const MODEL = "gemini-3.5-flash-lite";
const MAX_HISTORY = 24;

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function parseReading(value: unknown): InsightReading | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const pvKw = finite(input.pvKw, 0, 1000);
  const loadKw = finite(input.loadKw, 0, 1000);
  const gridKw = finite(input.gridKw, -1000, 1000);
  if (pvKw === null || loadKw === null || gridKw === null || typeof input.gridConnected !== "boolean") return null;
  const recent = Array.isArray(input.recent) ? input.recent.slice(-MAX_HISTORY).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const point = item as Record<string, unknown>;
    const time = finite(point.time, 0, Date.now() + 86_400_000);
    const pointPv = finite(point.pvKw, 0, 1000);
    const pointLoad = finite(point.loadKw, 0, 1000);
    if (time === null || pointPv === null || pointLoad === null) return [];
    return [{ time, pvKw: pointPv, loadKw: pointLoad, temperature: finite(point.temperature, -50, 150) }];
  }) : [];
  return {
    pvKw,
    loadKw,
    gridKw,
    gridConnected: input.gridConnected,
    temperatureC: finite(input.temperatureC, -50, 150),
    statusCode: finite(input.statusCode, -100000, 100000),
    faultCode: finite(input.faultCode, 0, 100000) ?? 0,
    warningCode: finite(input.warningCode, 0, 100000) ?? 0,
    todayEnergyKwh: finite(input.todayEnergyKwh, 0, 100000),
    recent,
  };
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ");
  return clean && clean.length <= max ? clean : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI insights are not configured" }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const payload = body as { language?: unknown; reading?: unknown };
  const language = payload?.language === "ur" ? "ur" : payload?.language === "en" ? "en" : null;
  const reading = parseReading(payload?.reading);
  if (!language || !reading) return NextResponse.json({ error: "Invalid energy data" }, { status: 400 });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const prompt = `Analyze this read-only home solar inverter snapshot and recent 5-minute samples. Return one useful insight. Use ${language === "ur" ? "natural, simple Urdu" : "clear, simple English"}. Base every number and claim only on the supplied data. Never claim a diagnosis. Prioritize active faults, unsafe heat, unusual production/load trends, then solar surplus opportunities. Keep summary under 28 words and action under 22 words. Data: ${JSON.stringify(reading)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 180,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" }, summary: { type: "STRING" }, action: { type: "STRING" },
              severity: { type: "STRING", enum: ["good", "info", "warning"] },
            },
            required: ["title", "summary", "action", "severity"],
          },
        },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: response.status === 429 ? "AI free quota is temporarily unavailable" : "AI analysis unavailable" }, { status: 503 });
    const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty model response");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const title = cleanText(parsed.title, 80);
    const summary = cleanText(parsed.summary, 240);
    const action = cleanText(parsed.action, 200);
    const severity = parsed.severity as InsightSeverity;
    if (!title || !summary || !action || !["good", "info", "warning"].includes(severity)) throw new Error("Invalid model response");
    const insight: EnergyInsight = { title, summary, action, severity, source: "gemini", generatedAt: new Date().toISOString() };
    return NextResponse.json(insight, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "AI analysis unavailable" }, { status: 503 });
  }
}
