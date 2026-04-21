/**
 * seed-quick18.ts
 *
 * Seeds Quick18 courses into the Supabase `courses` table.
 * Idempotent — uses upsert on slug so safe to re-run.
 *
 * Usage:  npx tsx scripts/seed-quick18.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing env vars. Check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Course = {
  name: string;
  slug: string;
  platform: "quick18";
  booking_url: string;
  suburb: string;
  state: string;
  lat: number;
  lng: number;
  active: boolean;
};

// Verified Quick18 courses with working searchmatrix pages
const COURSES: Course[] = [
  // WA
  {
    name: "Hamersley Public Golf Course",
    slug: "hamersley-public-golf-course",
    platform: "quick18",
    booking_url: "https://hamersley.quick18.com/teetimes/searchmatrix",
    suburb: "Karrinyup",
    state: "WA",
    lat: -31.8571,
    lng: 115.7772,
    active: true,
  },
  {
    name: "The Springs Club",
    slug: "the-springs-club",
    platform: "quick18",
    booking_url: "https://springs.quick18.com/teetimes/searchmatrix",
    suburb: "Forrestdale",
    state: "WA",
    lat: -32.1504,
    lng: 115.9379,
    active: true,
  },
  // QLD
  {
    name: "St Lucia Golf Links",
    slug: "st-lucia-golf-links",
    platform: "quick18",
    booking_url: "https://stlucia.quick18.com/teetimes/searchmatrix",
    suburb: "St Lucia",
    state: "QLD",
    lat: -27.5044,
    lng: 153.0001,
    active: true,
  },
  // SA
  {
    name: "Little Para Golf Course",
    slug: "little-para-golf-course",
    platform: "quick18",
    booking_url: "https://littlepara.quick18.com/teetimes/searchmatrix",
    suburb: "Paralowie",
    state: "SA",
    lat: -34.7553,
    lng: 138.5978,
    active: true,
  },
  {
    name: "Regency Park Golf Course",
    slug: "regency-park-golf-course",
    platform: "quick18",
    booking_url: "https://regencypark.quick18.com/teetimes/searchmatrix",
    suburb: "Regency Park",
    state: "SA",
    lat: -34.8575,
    lng: 138.5765,
    active: true,
  },
  // VIC
  {
    name: "Freeway Golf Course",
    slug: "freeway-golf-course",
    platform: "quick18",
    booking_url: "https://freeway.quick18.com/teetimes/searchmatrix",
    suburb: "Balwyn North",
    state: "VIC",
    lat: -37.7876,
    lng: 145.0878,
    active: true,
  },
  {
    name: "Royal Park Golf Course",
    slug: "royal-park-golf-course",
    platform: "quick18",
    booking_url: "https://royalpark.quick18.com/teetimes/searchmatrix",
    suburb: "Parkville",
    state: "VIC",
    lat: -37.7814,
    lng: 144.9528,
    active: true,
  },
  // NSW
  {
    name: "The Vale Golf Course",
    slug: "the-vale-golf-course",
    platform: "quick18",
    booking_url: "https://russellvale.quick18.com/teetimes/searchmatrix",
    suburb: "Russell Vale",
    state: "NSW",
    lat: -34.3683,
    lng: 150.8817,
    active: true,
  },
];

async function main() {
  console.log(`Seeding ${COURSES.length} Quick18 courses...\n`);

  let success = 0;
  let failed = 0;

  for (const course of COURSES) {
    process.stdout.write(`→ ${course.name} (${course.suburb}, ${course.state})... `);
    const { error } = await supabase
      .from("courses")
      .upsert(course, { onConflict: "slug" });

    if (error) {
      console.log(`✗ ${error.message}`);
      failed++;
    } else {
      console.log("✓");
      success++;
    }
  }

  console.log(`\nDone. ${success} seeded, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
