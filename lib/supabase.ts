import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type NearbyCourse = {
  id: string;
  name: string;
  slug: string;
  platform: "miclub" | "quick18";
  booking_url: string;
  suburb: string | null;
  state: string | null;
  distance_km: number;
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

export async function findNearbyCourses(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<NearbyCourse[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("nearby_courses", {
    u_lat: lat,
    u_lng: lng,
    radius_km: radiusKm,
  });
  if (error) throw new Error(`nearby_courses: ${error.message}`);
  return (data ?? []) as NearbyCourse[];
}

export type { NearbyCourse };
