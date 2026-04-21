/**
 * Seed Araluen (MiClub/OneGolf) + 3 new Quick18 courses.
 * Usage: npx tsx scripts/seed-new-courses.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COURSES = [
  {
    name: "Araluen Estate Golf Course",
    slug: "araluen-estate-golf-course",
    platform: "miclub",
    booking_url:
      "https://araluenestategolfcourse.miclub.com.au/guests/bookings/ViewPublicCalendar.msp",
    suburb: "Roleystone",
    state: "WA",
    lat: -32.1148,
    lng: 116.0674,
    active: true,
  },
  {
    name: "Sandy Golf Links",
    slug: "sandy-golf-links",
    platform: "quick18",
    booking_url: "https://sandringham.quick18.com/teetimes/searchmatrix",
    suburb: "Cheltenham",
    state: "VIC",
    lat: -37.954,
    lng: 145.0475,
    active: true,
  },
  {
    name: "Burnley Golf Course",
    slug: "burnley-golf-course",
    platform: "quick18",
    booking_url: "https://burnley.quick18.com/teetimes/searchmatrix",
    suburb: "Burnley",
    state: "VIC",
    lat: -37.8265,
    lng: 145.01,
    active: true,
  },
  {
    name: "Eagle Ridge Golf Course",
    slug: "eagle-ridge-golf-course",
    platform: "quick18",
    booking_url: "https://eagleridge-au.quick18.com/teetimes/searchmatrix",
    suburb: "Mornington Peninsula",
    state: "VIC",
    lat: -38.3547,
    lng: 145.1283,
    active: true,
  },
];

async function main() {
  console.log(`Seeding ${COURSES.length} new courses...\n`);
  for (const c of COURSES) {
    process.stdout.write(`→ ${c.name} (${c.suburb}, ${c.state})... `);
    const { error } = await supabase
      .from("courses")
      .upsert(c, { onConflict: "slug" });
    console.log(error ? `✗ ${error.message}` : "✓");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
