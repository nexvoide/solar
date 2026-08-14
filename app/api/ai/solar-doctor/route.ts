import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const MODEL = "gemini-3.5-flash-lite";

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().replace(/\s+/g, " ");
  return result && result.length <= max ? result : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI Solar Doctor is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const language = input.language === "ur" ? "ur" : input.language === "en" ? "en" : null;
  const diagnostic = input.diagnostic;
  const system = input.system;
  const weather = input.weather;
  if (!language || !diagnostic || typeof diagnostic !== "object" || !system || typeof system !== "object" || !weather || typeof weather !== "object") {
    return NextResponse.json({ error: "Invalid diagnostic data" }, { status: 400 });
  }
  const payload = JSON.stringify({ system, weather, diagnostic });
  if (payload.length > 16_000) return NextResponse.json({ error: "Diagnostic data is too large" }, { status: 413 });

  const instruction = `You are AI Solar Doctor inside a home solar monitoring app. Explain why PV may be below a deterministic forecast. Reason ONLY from the supplied system configuration, weather measurements, metrics, and ranked diagnostic evidence. Never invent readings or claim certainty unsupported by evidence. Distinguish confirmed evidence, likely causes, possibilities, and insufficient data. Weather, measured rain, normal inverter clipping, and heat are explanations, not hardware faults. Never tell a homeowner to open equipment, touch terminals, disconnect wiring, bypass protection, or perform electrical work. Recommend a qualified solar technician only when active fault evidence or a persistent unexplained severe anomaly supports it. Write in ${language === "ur" ? "natural simple Urdu" : "clear simple English"}. Return structured JSON only. Data: ${payload}`;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: instruction }] }], generationConfig: {
        temperature: 0.15, maxOutputTokens: 420, responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: {
          headline: { type: "STRING" }, explanation: { type: "STRING" }, primaryCause: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
          recommendations: { type: "ARRAY", minItems: 1, maxItems: 3, items: { type: "STRING" } },
          urgency: { type: "STRING", enum: ["none", "monitor", "check_soon", "technician"] },
          technicianRecommended: { type: "BOOLEAN" },
        }, required: ["headline", "explanation", "primaryCause", "confidence", "recommendations", "urgency", "technicianRecommended"] },
      } }),
    });
    if (!response.ok) return NextResponse.json({ error: response.status === 429 ? "AI free quota is temporarily unavailable" : "AI diagnosis unavailable" }, { status: 503 });
    const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Empty model response");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const headline = clean(parsed.headline, 140); const explanation = clean(parsed.explanation, 420); const primaryCause = clean(parsed.primaryCause, 100);
    const confidence = parsed.confidence; const urgency = parsed.urgency;
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3).flatMap((item) => clean(item, 180) ?? []) : [];
    if (!headline || !explanation || !primaryCause || !recommendations.length || !["high", "medium", "low"].includes(String(confidence)) || !["none", "monitor", "check_soon", "technician"].includes(String(urgency)) || typeof parsed.technicianRecommended !== "boolean") throw new Error("Invalid model response");
    return NextResponse.json({ headline, explanation, primaryCause, confidence, recommendations, urgency, technicianRecommended: parsed.technicianRecommended, source: "gemini" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "AI diagnosis unavailable" }, { status: 503 }); }
}
