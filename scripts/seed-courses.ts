/**
 * Seed the `courses` table from a CSV file.
 *
 * Usage:
 *   npx tsx scripts/seed-courses.ts scripts/courses.csv
 *
 * CSV columns (header row required):
 *   name,slug,platform,booking_url,state,suburb,postcode,lat,lng,holes
 *
 * Requires env vars NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

type Row = {
  name: string;
  slug: string;
  platform: "miclub" | "quick18";
  booking_url: string;
  state?: string;
  suburb?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  holes?: number;
};

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = lines.shift();
  if (!header) throw new Error("Empty CSV");
  const cols = header.split(",").map((c) => c.trim());
  return lines.map((line) => {
    const vals = splitCsvLine(line);
    const row: Record<string, string> = {};
    cols.forEach((c, i) => (row[c] = (vals[i] ?? "").trim()));
    return {
      name: row.name,
      slug: row.slug,
      platform: row.platform as Row["platform"],
      booking_url: row.booking_url,
      state: row.state || undefined,
      suburb: row.suburb || undefined,
      postcode: row.postcode || undefined,
      lat: row.lat ? Number(row.lat) : undefined,
      lng: row.lng ? Number(row.lng) : undefined,
      holes: row.holes ? Number(row.holes) : undefined,
    };
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  const path = process.argv[2];
  if (!path) { console.error("Provide a CSV path."); process.exit(1); }
  const csv = readFileSync(resolve(path), "utf8");
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} rows.`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { error } = await supabase.from("courses").upsert(rows, { onConflict: "slug" });
  if (error) throw error;
  console.log(`Upserted ${rows.length} courses.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
