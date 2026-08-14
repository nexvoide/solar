import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function numberParam(url: URL, name: string, min: number, max: number): number | null {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const latitude = numberParam(requestUrl, "latitude", -90, 90);
  const longitude = numberParam(requestUrl, "longitude", -180, 180);
  const tilt = numberParam(requestUrl, "tilt", 0, 90) ?? 30;
  const azimuth = numberParam(requestUrl, "azimuth", -180, 180) ?? 0;

  if (latitude === null || longitude === null) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const target = new URL("https://api.open-meteo.com/v1/forecast");
  target.searchParams.set("latitude", String(latitude));
  target.searchParams.set("longitude", String(longitude));
  target.searchParams.set("timezone", "auto");
  target.searchParams.set("forecast_days", "2");
  target.searchParams.set("tilt", String(tilt));
  target.searchParams.set("azimuth", String(azimuth));
  target.searchParams.set("current", "temperature_2m,relative_humidity_2m,cloud_cover,precipitation,rain,showers,weather_code,wind_speed_10m,shortwave_radiation");
  target.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,cloud_cover,precipitation_probability,wind_speed_10m,uv_index,weather_code,shortwave_radiation,global_tilted_irradiance");
  target.searchParams.set("daily", "sunrise,sunset");

  try {
    const response = await fetch(target, { next: { revalidate: 300 } });
    const data: unknown = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: "Weather forecast unavailable" }, { status: 502 });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ error: "Weather service unavailable" }, { status: 503 });
  }
}
