import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type NearbyCourse = {
  id: string;
  name: string;
  slug: string;
  platform: "miclub" | "quick18";
  booking_url: string;
  suburb: string | null;
  state: string | null;
  lat: number;
  lng: number;
  distance_km: number;
  image_url: string | null;
};

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon key)."
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export async function findCoursesByName(query: string): Promise<NearbyCourse[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, slug, platform, booking_url, suburb, state, lat, lng")
    .eq("active", true)
    .ilike("name", `%${query}%`)
    .limit(15);
  if (error) throw new Error(`findCoursesByName: ${error.message}`);
  return ((data ?? []) as Omit<NearbyCourse, "distance_km">[]).map((c) => ({
    ...c,
    distance_km: 0,
  }));
}

export async function findNearbyCourses(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<NearbyCourse[]> {
  const supabase = getSupabase();

  // Step 1: get nearby course IDs + distances via RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc("nearby_courses", {
    u_lat: lat,
    u_lng: lng,
    radius_km: radiusKm,
  });
  if (rpcError) throw new Error(`nearby_courses: ${rpcError.message}`);
  if (!rpcData || rpcData.length === 0) return [];

  // Step 2: fetch image_url for those courses (not returned by RPC)
  const ids = (rpcData as { id: string }[]).map((r) => r.id);
  const { data: imageData, error: imageError } = await supabase
    .from("courses")
    .select("id, image_url")
    .in("id", ids);

  if (imageError) {
    // Non-fatal — just proceed without images
    console.warn("Could not fetch image_url:", imageError.message);
  }

  const imageMap = new Map<string, string | null>(
    (imageData ?? []).map((r: { id: string; image_url: string | null }) => [r.id, r.image_url])
  );

  return (rpcData as Omit<NearbyCourse, "image_url">[]).map((course) => ({
    ...course,
    image_url: imageMap.get(course.id) ?? null,
  }));
}

export type { NearbyCourse };
