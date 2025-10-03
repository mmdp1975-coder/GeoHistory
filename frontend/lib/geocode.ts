// frontend/lib/geocode.ts
type GeocodeResult = { lat?: number; lon?: number; country?: string; display_name?: string };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function geocodeOneFreeform(q: string): Promise<GeocodeResult | null> {
  if (!q || !q.trim()) return null;
  const ua = process.env.NOMINATIM_USER_AGENT || "GeoHistoryImporter/1.0 (contact@example.com)";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;

  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    try {
      const res = await fetch(url, { headers: { "User-Agent": ua } });
      if (res.status === 429) { await sleep(800 * attempt); continue; }
      if (!res.ok) return null;
      const arr = await res.json();
      if (!arr || !arr.length) return null;
      const hit = arr[0];
      const address = hit?.address || {};
      const country = address.country || hit?.display_name?.split(",")?.pop()?.trim();
      return {
        lat: hit?.lat ? Number(hit.lat) : undefined,
        lon: hit?.lon ? Number(hit.lon) : undefined,
        country: country || undefined,
        display_name: hit?.display_name || undefined
      };
    } catch {
      await sleep(500 * attempt);
    }
  }
  return null;
}
