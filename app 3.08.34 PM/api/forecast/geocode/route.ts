import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json({ error: "Enter a valid city" }, { status: 400 });
  }
  const target = new URL("https://geocoding-api.open-meteo.com/v1/search");
  target.searchParams.set("name", query);
  target.searchParams.set("count", "5");
  target.searchParams.set("language", "en");
  target.searchParams.set("format", "json");
  try {
    const response = await fetch(target, { next: { revalidate: 86400 } });
    const data = await response.json();
    return NextResponse.json(data, { status: response.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ error: "Location search unavailable" }, { status: 503 });
  }
}
