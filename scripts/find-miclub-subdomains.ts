/**
 * For each failed candidate, try subdomain variants against miclub.com.au.
 * Prints the first variant that responds with MiClub booking markers.
 * Run: npx tsx scripts/find-miclub-subdomains.ts
 */

const UA = "TheFairwaySociety/1.0";

// (name, original failed guess, state, suburb)
const FAILED: { name: string; original: string; state: string; suburb: string }[] = [
  { name: "Mount Lawley Golf Club", original: "mountlawley", state: "WA", suburb: "Inglewood" },
  { name: "Lake Karrinyup Country Club", original: "lakekarrinyup", state: "WA", suburb: "Karrinyup" },
  { name: "Mosman Park Golf Club", original: "mosmanpark", state: "WA", suburb: "Mosman Park" },
  { name: "Melville Glades Golf Club", original: "melvilleglades", state: "WA", suburb: "Leeming" },
  { name: "Hamersley Public Golf Course", original: "hamersley", state: "WA", suburb: "Hamersley" },
  { name: "The Western Australian Golf Club", original: "wagolfclub", state: "WA", suburb: "Yokine" },
  { name: "The Australian Golf Club", original: "australiangolf", state: "NSW", suburb: "Rosebery" },
  { name: "Pennant Hills Golf Club", original: "pennanthills", state: "NSW", suburb: "Beecroft" },
  { name: "Kogarah Golf Club", original: "kogarah", state: "NSW", suburb: "Arncliffe" },
  { name: "Kingston Heath Golf Club", original: "kingstonheath", state: "VIC", suburb: "Cheltenham" },
  { name: "Victoria Golf Club", original: "victoriagolf", state: "VIC", suburb: "Cheltenham" },
  { name: "Yarra Yarra Golf Club", original: "yarrayarra", state: "VIC", suburb: "Bentleigh East" },
  { name: "Peninsula Kingswood", original: "peninsulakingswood", state: "VIC", suburb: "Frankston" },
  { name: "The National Golf Club", original: "thenational", state: "VIC", suburb: "Cape Schanck" },
  { name: "Victoria Park Golf", original: "victoriapark", state: "QLD", suburb: "Herston" },
  { name: "RACV Royal Pines", original: "racvroyalpines", state: "QLD", suburb: "Benowa" },
  { name: "The Vines Golf Club Reynella", original: "vinesreynella", state: "SA", suburb: "Reynella" },
  { name: "Kingston Beach Golf Club", original: "kingstonbeach", state: "TAS", suburb: "Kingston Beach" },
  { name: "Tasmania Golf Club", original: "tasmaniagolf", state: "TAS", suburb: "Barilla Bay" },
];

function variants(name: string, original: string): string[] {
  const normalized = name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const words = normalized.split(/\s+/).filter((w) => !["the", "golf", "club", "country", "course", "resort", "park", "links", "public"].includes(w));
  const joined = words.join("");
  const first = words[0] ?? "";
  const firstTwo = words.slice(0, 2).join("");
  const out = new Set<string>([
    original,
    joined,
    first,
    firstTwo,
    first + "gc",
    first + "golf",
    joined + "golf",
    joined + "gc",
  ]);
  return [...out].filter(Boolean);
}

async function probe(subdomain: string): Promise<boolean> {
  const url = `https://${subdomain}.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return false;
    const text = await res.text();
    return /feeGroupRow|redirectToTimesheet/i.test(text);
  } catch {
    return false;
  }
}

async function main() {
  const hits: { name: string; subdomain: string; state: string; suburb: string }[] = [];
  for (const c of FAILED) {
    const vs = variants(c.name, c.original);
    let found: string | null = null;
    for (const v of vs) {
      if (await probe(v)) { found = v; break; }
    }
    const tag = found ? `✅ ${found}` : `❌ tried: ${vs.join(", ")}`;
    console.log(`${c.name.padEnd(38)} ${tag}`);
    if (found) hits.push({ name: c.name, subdomain: found, state: c.state, suburb: c.suburb });
  }

  console.log(`\n${hits.length}/${FAILED.length} resolved.`);
  if (hits.length) {
    console.log("\nPaste into candidates.txt (replace old entries first):\n");
    for (const h of hits) {
      console.log(`${h.name}|${h.subdomain}|${h.state}|${h.suburb}`);
    }
  }
}

main().catch(console.error);
