/**
 * Probe-and-seed for MiClub courses.
 *
 * Reads scripts/candidates.txt (pipe-separated: name|subdomain|state|suburb).
 * For each candidate:
 *   1. HEAD-checks https://<subdomain>.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000
 *   2. GETs the page and confirms it has MiClub markers (feeGroupRow / row-heading).
 *   3. Geocodes via Nominatim ("<suburb> <state> Australia").
 *   4. Upserts to Supabase courses table by slug.
 *
 * Run:
 *   npx tsx scripts/probe-and-seed.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

type Candidate = { name: string; subdomain: string; state: string; suburb: string };

const UA = "TheFairwaySociety/1.0 (contact@thefairwaysociety.com.au)";
const NOMINATIM_DELAY_MS = 1100; // be polite — 1 req/sec policy

function parseCandidates(path: string): Candidate[] {
  const text = readFileSync(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((line) => {
      const [name, subdomain, state, suburb] = line.split("|").map((s) => s.trim());
      if (!name || !subdomain || !state || !suburb) {
        throw new Error(`Bad candidate line: ${line}`);
      }
      return { name, subdomain, state, suburb };
    });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function probeUrl(subdomain: string): Promise<string | null> {
  const url = `https://${subdomain}.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    // MiClub booking pages reliably contain these markers.
    if (text.includes("feeGroupRow") || text.includes("redirectToTimesheet")) {
      return res.url; // final URL after any redirects
    }
    return null;
  } catch {
    return null;
  }
}

async function geocode(suburb: string, state: string, name: string): Promise<{ lat: number; lng: number; postcode?: string } | null> {
  // Try a focused query first (golf club name), then fall back to suburb.
  const queries = [
    `${name}, ${state}, Australia`,
    `${suburb}, ${state}, Australia`,
  ];
  for (const q of queries) {
    try {
      const u = new URL("https://nominatim.openstreetmap.org/search");
      u.searchParams.set("q", q);
      u.searchParams.set("format", "json");
      u.searchParams.set("limit", "1");
      u.searchParams.set("countrycodes", "au");
      u.searchParams.set("addressdetails", "1");
      const res = await fetch(u, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const arr = (await res.json()) as Array<{
        lat: string;
        lon: string;
        address?: { postcode?: string };
      }>;
      if (arr.length) {
        return {
          lat: Number(arr[0].lat),
          lng: Number(arr[0].lon),
          postcode: arr[0].address?.postcode,
        };
      }
    } catch {
      // ignore and try next
    } finally {
      await sleep(NOMINATIM_DELAY_MS);
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const candidates = parseCandidates(resolve("scripts/candidates.txt"));
  console.log(`Probing ${candidates.length} candidates...`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const verified: {
    name: string; slug: string; platform: "miclub";
    booking_url: string; state: string; suburb: string;
    postcode: string | null; lat: number | null; lng: number | null;
    active: boolean;
  }[] = [];

  // Probe in parallel batches of 8 (be nice).
  const batchSize = 8;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const probed = await Promise.all(
      batch.map(async (c) => {
        const verifiedUrl = await probeUrl(c.subdomain);
        return { c, verifiedUrl };
      })
    );
    for (const { c, verifiedUrl } of probed) {
      const status = verifiedUrl ? "✅" : "❌";
      console.log(`${status} ${c.name} (${c.subdomain}.miclub.com.au)`);
      if (verifiedUrl) {
        verified.push({
          name: c.name,
          slug: slugify(c.name),
          platform: "miclub",
          booking_url: verifiedUrl,
          state: c.state,
          suburb: c.suburb,
          postcode: null,
          lat: null,
          lng: null,
          active: true,
        });
      }
    }
  }

  console.log(`\n${verified.length}/${candidates.length} verified. Geocoding...\n`);

  // Geocode sequentially (Nominatim rate limit).
  for (const row of verified) {
    const geo = await geocode(row.suburb, row.state, row.name);
    if (geo) {
      row.lat = geo.lat;
      row.lng = geo.lng;
      row.postcode = geo.postcode ?? null;
      console.log(`📍 ${row.name} → ${geo.lat.toFixed(3)}, ${geo.lng.toFixed(3)}`);
    } else {
      console.log(`⚠ ${row.name} — no geocode, skipping`);
    }
  }

  const seedable = verified.filter((r) => r.lat !== null && r.lng !== null);
  console.log(`\nUpserting ${seedable.length} courses to Supabase...`);

  if (seedable.length === 0) {
    console.log("Nothing to upsert.");
    return;
  }

  const { error } = await supabase.from("courses").upsert(seedable, { onConflict: "slug" });
  if (error) throw error;
  console.log(`✅ Done. ${seedable.length} courses in DB.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
