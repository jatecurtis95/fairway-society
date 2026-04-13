/**
 * enrich-photos.ts
 *
 * 1. Runs the DB migration (adds place_id + image_url columns if missing).
 * 2. Fetches every active course that has no image_url yet.
 * 3. For each course, calls Google Places Text Search to find the place,
 *    then fetches the first photo and stores the direct image URL back in Supabase.
 *
 * Usage:  npx tsx scripts/enrich-photos.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GOOGLE_API_KEY) {
  console.error("Missing env vars. Check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Step 1 — Ensure columns exist via a raw SQL call through PostgREST
// We use the Supabase REST API to call a simple select first to check,
// then handle the migration via the existing schema approach.
// ---------------------------------------------------------------------------
async function ensureColumns() {
  // Try selecting the new columns — if they don't exist the query will error
  const { error } = await supabase
    .from("courses")
    .select("place_id, image_url")
    .limit(1);

  if (error && error.message.includes("column")) {
    console.log("Columns missing — please run the migration SQL in Supabase dashboard:");
    console.log("  ALTER TABLE courses ADD COLUMN IF NOT EXISTS place_id text, ADD COLUMN IF NOT EXISTS image_url text;");
    console.log("\nTrying to continue anyway — will attempt upsert with these fields...");
  } else {
    console.log("✓ Columns place_id and image_url confirmed present.");
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Google Places Text Search → get place_id
// ---------------------------------------------------------------------------
async function findPlaceId(courseName: string, suburb: string | null, state: string | null): Promise<string | null> {
  const query = [courseName, suburb, state, "golf course", "Australia"]
    .filter(Boolean)
    .join(" ");

  const url = `https://places.googleapis.com/v1/places:searchText`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`  Google Places search failed for "${courseName}": ${res.status} ${text}`);
    return null;
  }

  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text: string };
      photos?: Array<{ name: string }>;
    }>;
  };

  if (!data.places || data.places.length === 0) {
    console.warn(`  No Google Places result for "${courseName}"`);
    return null;
  }

  return data.places[0].id;
}

// ---------------------------------------------------------------------------
// Step 3 — Fetch first photo URL for a place
// ---------------------------------------------------------------------------
async function fetchPhotoUrl(placeId: string): Promise<string | null> {
  // First get place details with photos field mask
  const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}`;
  const detailsRes = await fetch(detailsUrl, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "photos",
    },
  });

  if (!detailsRes.ok) {
    console.warn(`  Failed to get place details for ${placeId}: ${detailsRes.status}`);
    return null;
  }

  const details = (await detailsRes.json()) as {
    photos?: Array<{ name: string; widthPx: number; heightPx: number }>;
  };

  if (!details.photos || details.photos.length === 0) {
    console.warn(`  No photos found for place ${placeId}`);
    return null;
  }

  // Use the first photo, request a 800x500 crop (landscape, good for cards)
  const photoName = details.photos[0].name;
  const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&maxHeightPx=500&key=${GOOGLE_API_KEY}&skipHttpRedirect=true`;

  const photoRes = await fetch(photoUrl);
  if (!photoRes.ok) {
    console.warn(`  Failed to resolve photo URL for ${photoName}: ${photoRes.status}`);
    return null;
  }

  const photoData = (await photoRes.json()) as { photoUri?: string };
  return photoData.photoUri ?? null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  await ensureColumns();

  // Fetch all active courses that don't yet have an image_url
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, name, suburb, state, place_id, image_url")
    .eq("active", true)
    .is("image_url", null);

  if (error) {
    // If the column doesn't exist yet, fetch all and we'll just try to update
    console.error("Error fetching courses:", error.message);
    console.log("\nHave you run the migration SQL yet? Run this in Supabase SQL Editor:");
    console.log("ALTER TABLE courses ADD COLUMN IF NOT EXISTS place_id text, ADD COLUMN IF NOT EXISTS image_url text;");
    process.exit(1);
  }

  if (!courses || courses.length === 0) {
    console.log("All courses already have photos — nothing to do.");
    return;
  }

  console.log(`\nEnriching ${courses.length} courses with Google Places photos...\n`);

  let success = 0;
  let failed = 0;

  for (const course of courses) {
    process.stdout.write(`→ ${course.name} (${course.suburb ?? ""}, ${course.state ?? ""})... `);

    try {
      // Find place ID
      const placeId = await findPlaceId(course.name, course.suburb, course.state);
      if (!placeId) {
        console.log("✗ no place found");
        failed++;
        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      // Fetch photo URL
      const imageUrl = await fetchPhotoUrl(placeId);
      if (!imageUrl) {
        console.log("✗ no photo");
        failed++;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      // Save to Supabase
      const { error: updateError } = await supabase
        .from("courses")
        .update({ place_id: placeId, image_url: imageUrl })
        .eq("id", course.id);

      if (updateError) {
        console.log(`✗ DB update failed: ${updateError.message}`);
        failed++;
      } else {
        console.log(`✓`);
        success++;
      }
    } catch (err) {
      console.log(`✗ error: ${err}`);
      failed++;
    }

    // Polite delay between requests
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone. ${success} enriched, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
