// Light-weight AU postcode -> lat/lng resolver using Nominatim (OpenStreetMap).
// No API key. Respectful of their 1 req/sec policy; cached per-process.

const cache = new Map<string, { lat: number; lng: number } | null>();

export async function resolveAuPostcode(
  postcode: string
): Promise<{ lat: number; lng: number } | null> {
  const key = postcode.trim();
  if (!/^\d{4}$/.test(key)) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("country", "Australia");
  url.searchParams.set("postalcode", key);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url, {
      headers: { "user-agent": "TheFairwaySociety/1.0 (contact@thefairwaysociety.com.au)" },
    });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!arr.length) {
      cache.set(key, null);
      return null;
    }
    const hit = { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
    cache.set(key, hit);
    return hit;
  } catch {
    cache.set(key, null);
    return null;
  }
}
