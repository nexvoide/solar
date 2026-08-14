import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const MODEL = "gemini-3.5-flash-lite";
function clean(value: unknown, max: number) { if (typeof value !== "string") return null; const result = value.trim().replace(/\s+/g, " "); return result && result.length <= max ? result : null; }

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) return NextResponse.json({ error: "Predictive AI is not configured" }, { status: 503 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 }); const input = body as Record<string, unknown>;
  const language = input.language === "ur" ? "ur" : input.language === "en" ? "en" : null; const analysis = input.analysis; const system = input.system;
  if (!language || !analysis || typeof analysis !== "object" || !system || typeof system !== "object") return NextResponse.json({ error: "Invalid health data" }, { status: 400 });
  const evidence = JSON.stringify({ system, analysis }); if (evidence.length > 18_000) return NextResponse.json({ error: "Health data is too large" }, { status: 413 });
  const prompt = `You are the predictive AI layer of a solar monitoring application. Interpret ONLY the supplied deterministic solar health evidence. Never invent measurements or claim a component failed without supporting telemetry. A normalized decline does not automatically mean panel or inverter degradation. Clearly distinguish observed facts, likely causes, possibilities, and unknowns. Consider weather, temperature, shading, soiling, inverter events, sensor quality, communication gaps, grid limitations, and normal variation. If evidence or data quality is insufficient, explicitly say the app is building a baseline. Never give electrical repair instructions; recommend a qualified solar technician for supported hardware concerns. Write concise homeowner-friendly ${language === "ur" ? "natural Urdu" : "English"}. Return JSON only. Evidence: ${evidence}`;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method:"POST", cache:"no-store", signal:AbortSignal.timeout(12_000), headers:{"Content-Type":"application/json","x-goog-api-key":apiKey}, body:JSON.stringify({ contents:[{role:"user",parts:[{text:prompt}]}], generationConfig:{ temperature:.15,maxOutputTokens:450,responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{headline:{type:"STRING"},summary:{type:"STRING"},primaryConcern:{type:"STRING"},confidence:{type:"STRING",enum:["low","medium","high"]},recommendations:{type:"ARRAY",minItems:1,maxItems:3,items:{type:"STRING"}},technicianRecommended:{type:"BOOLEAN"}},required:["headline","summary","primaryConcern","confidence","recommendations","technicianRecommended"]}} }) });
    if (!response.ok) return NextResponse.json({ error: response.status === 429 ? "AI free quota is temporarily unavailable" : "Predictive AI unavailable" }, { status:503 });
    const result = await response.json() as { candidates?: Array<{content?:{parts?:Array<{text?:string}>}}> }; const raw = result.candidates?.[0]?.content?.parts?.[0]?.text; if (!raw) throw new Error("Empty response"); const parsed = JSON.parse(raw) as Record<string,unknown>;
    const headline=clean(parsed.headline,140), summary=clean(parsed.summary,420), primaryConcern=clean(parsed.primaryConcern,120); const confidence=parsed.confidence; const recommendations=Array.isArray(parsed.recommendations)?parsed.recommendations.slice(0,3).flatMap((item)=>clean(item,180)??[]):[];
    if(!headline||!summary||!primaryConcern||!recommendations.length||!["low","medium","high"].includes(String(confidence))||typeof parsed.technicianRecommended!=="boolean") throw new Error("Invalid response");
    return NextResponse.json({headline,summary,primaryConcern,confidence,recommendations,technicianRecommended:parsed.technicianRecommended,source:"gemini"},{headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.json({error:"Predictive AI unavailable"},{status:503}); }
}
