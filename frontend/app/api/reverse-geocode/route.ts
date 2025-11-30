import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GEOAPIFY_API_KEY" }, { status: 500 });
  }

  const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&lang=en&limit=1&apiKey=${apiKey}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return NextResponse.json({ error: "Geoapify error" }, { status: 502 });
    }
    const data = await resp.json();
    const props = data?.features?.[0]?.properties ?? {};
    const continent = props.continent || null;
    const country = props.country || null;
    const place = props.city || props.town || props.village || props.state || props.county || props.country || null;

    return NextResponse.json({ continent, country, place });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Reverse geocode failed" }, { status: 500 });
  }
}
