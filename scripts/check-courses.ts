import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Query without RLS restrictions using service role
  const { data, error } = await sb
    .from("courses")
    .select("id,name,image_url,place_id,active,state")
    .order("name");

  if (error) {
    console.error("Error:", JSON.stringify(error, null, 2));
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("No courses found in DB at all. The table may be empty or the service role key may not be working.");
    return;
  }

  console.log("Total courses in DB:", data.length);
  const active = data.filter((c: Record<string, unknown>) => c.active);
  const withPhoto = active.filter((c: Record<string, unknown>) => c.image_url);
  const withoutPhoto = active.filter((c: Record<string, unknown>) => !c.image_url);
  console.log("Active:", active.length);
  console.log("With photo:", withPhoto.length);
  console.log("Without photo:", withoutPhoto.length);
  if (withoutPhoto.length > 0) {
    console.log("\nSample courses needing photos (first 5):");
    withoutPhoto.slice(0, 5).forEach((c: Record<string, unknown>) => console.log(" -", c.name, `(${c.state})`));
  }
}

main();
