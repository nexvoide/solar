import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const MODEL = "gemini-3.5-flash-lite";

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ");
  return clean && clean.length <= max ? clean : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI forecast is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const language = input.language === "ur" ? "ur" : input.language === "en" ? "en" : null;
  const loadKw = typeof input.loadKw === "number" && Number.isFinite(input.loadKw) && input.loadKw >= 0 && input.loadKw <= 1000 ? input.loadKw : null;
  const hours = Array.isArray(input.hours) ? input.hours.slice(0, 24) : [];
  const appliances = Array.isArray(input.appliances) ? input.appliances.slice(0, 20) : [];
  if (!language || loadKw === null || !hours.length) return NextResponse.json({ error: "Invalid forecast data" }, { status: 400 });

  const prompt = `Act as a cautious home solar planning assistant. Interpret the supplied calculated forecast; never change, invent, or imply greater precision than its numbers. Write in ${language === "ur" ? "natural simple Urdu" : "clear simple English"}. Create a concise briefing and up to 3 useful schedule items using only the supplied hourly data, current constant load, and configured appliances. Account for appliance wattage, cloud/rain timing, and motor startup headroom. Never make electrical safety guarantees or diagnose equipment. In each plan item's time field, convert the supplied local ISO time into a short human label such as "10:00 AM" or "10:00 AM–12:00 PM"; never return a raw ISO timestamp. Data: ${JSON.stringify({ loadKw, hours, appliances })}`;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: {
        temperature: 0.2, maxOutputTokens: 450, responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: {
          briefing: { type: "STRING" }, confidence: { type: "STRING", enum: ["high", "medium", "low"] }, confidenceReason: { type: "STRING" },
          plan: { type: "ARRAY", maxItems: 3, items: { type: "OBJECT", properties: { time: { type: "STRING" }, task: { type: "STRING" }, reason: { type: "STRING" } }, required: ["time", "task", "reason"] } },
        }, required: ["briefing", "confidence", "confidenceReason", "plan"] },
      } }),
    });
    if (!response.ok) return NextResponse.json({ error: response.status === 429 ? "AI free quota is temporarily unavailable" : "AI forecast unavailable" }, { status: 503 });
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Empty model response");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const briefing = text(parsed.briefing, 360);
    const confidenceReason = text(parsed.confidenceReason, 220);
    const confidence = parsed.confidence;
    const plan = Array.isArray(parsed.plan) ? parsed.plan.slice(0, 3).flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const time = text(item.time, 60); const task = text(item.task, 100); const reason = text(item.reason, 220);
      return time && task && reason ? [{ time, task, reason }] : [];
    }) : [];
    if (!briefing || !confidenceReason || !["high", "medium", "low"].includes(String(confidence))) throw new Error("Invalid model response");
    return NextResponse.json({ briefing, confidence, confidenceReason, plan, source: "gemini" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "AI forecast unavailable" }, { status: 503 }); }
}
