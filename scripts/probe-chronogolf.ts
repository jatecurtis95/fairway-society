/**
 * Probe Chronogolf for common AU course slugs.
 * Run: npx tsx scripts/probe-chronogolf.ts
 */
const UA = "TheFairwaySociety/1.0";

// Common AU course names → slug variants to try
const CLUBS = [
  "Albert Park Golf Course", "Burswood Park Golf Course", "Marangaroo Golf Course",
  "Embleton Golf Course", "Cranbourne Golf Club", "Corinda Golf Course",
  "The Australian Golf Club", "Mount Lawley Golf Club", "Hartfield Country Club",
  "Wembley Golf Course", "Joondalup Resort", "Lake Karrinyup", "The Vines Resort",
  "Cottesloe Golf Club", "Royal Fremantle Golf Club", "Mosman Park Golf Club",
  "Melville Glades Golf Club", "Hamersley Public Golf Course", "Royal Perth Golf Club",
  "Secret Harbour Golf Links", "The Cut Golf Course", "Mandurah Country Club",
  "Meadow Springs Country Club", "Kennedy Bay Golf Links", "Sea View Golf Club",
  "Point Walter Golf Course", "Whaleback Golf Course", "Collier Park Golf Course",
  "Gosnells Golf Club", "Fremantle Public Golf Course", "Araluen Golf Resort",
  "Sun City Country Club", "Sanctuary Golf Resort",
  // NSW
  "Moore Park Golf", "Royal Sydney Golf Club", "The Lakes Golf Club",
  "New South Wales Golf Club", "Bonnie Doon Golf Club", "Concord Golf Club",
  "Manly Golf Club", "Long Reef Golf Club", "Avondale Golf Club", "Killara Golf Club",
  "Cromer Golf Club", "Eastlake Golf Club", "Pennant Hills Golf Club",
  "Roseville Golf Club", "Castle Hill Country Club", "Elanora Country Club",
  "St Michaels Golf Club", "Kogarah Golf Club",
  // VIC
  "Royal Melbourne Golf Club", "Kingston Heath Golf Club", "Huntingdale Golf Club",
  "Metropolitan Golf Club", "Commonwealth Golf Club", "Peninsula Kingswood",
  "Sandringham Golf Links", "Victoria Golf Club", "Yarra Yarra Golf Club",
  "The National Golf Club", "Sorrento Golf Club", "Sandhurst Club", "Yarra Bend Golf",
  // QLD
  "Royal Queensland Golf Club", "Brisbane Golf Club", "Indooroopilly Golf Club",
  "Keperra Golf Club", "Wynnum Golf Club", "Pacific Golf Club", "Carbrook Golf Club",
  "Brookwater Golf Club", "Sanctuary Cove", "Royal Pines Resort", "Lakelands Golf Club",
  "Palm Meadows Golf Course", "Pacific Harbour Golf", "Hope Island Golf",
  "Victoria Park Golf", "RACV Royal Pines",
  // SA
  "Royal Adelaide Golf Club", "Kooyonga Golf Club", "Glenelg Golf Club", "Grange Golf Club",
  "North Adelaide Golf Course", "West Lakes Golf Club", "Adelaide Shores Golf Park",
  "Mount Osmond Golf Club", "Flagstaff Hill Golf Club",
  // TAS
  "Royal Hobart Golf Club", "Launceston Golf Club", "Kingston Beach Golf Club",
  "Tasmania Golf Club", "Barnbougle Dunes", "Cape Wickham Links",
  // ACT
  "Royal Canberra Golf Club", "Federal Golf Club", "Gold Creek Country Club",
];

function slugify(name: string): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const noThe = base.replace(/^the-/, "");
  const noSuffix = base.replace(/-(golf-club|golf-course|country-club|golf-links|golf|club|resort|course)$/, "");
  return [...new Set([base, noThe, noSuffix])];
}

async function probe(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.chronogolf.com/club/${slug}`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const text = await res.text();
    if (text.includes("Error 404 Page not Found")) return null;
    const titleMatch = text.match(/<title>([^<]+)<\/title>/);
    return titleMatch ? titleMatch[1] : "(no title)";
  } catch {
    return null;
  }
}

async function main() {
  const hits: { name: string; slug: string; title: string }[] = [];
  const batchSize = 6;
  const allSlugs = CLUBS.flatMap((c) => slugify(c).map((s) => ({ name: c, slug: s })));
  // dedupe by slug
  const seen = new Set<string>();
  const unique = allSlugs.filter((x) => (seen.has(x.slug) ? false : (seen.add(x.slug), true)));

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (b) => ({ ...b, title: await probe(b.slug) })));
    for (const r of results) {
      if (r.title) {
        hits.push({ name: r.name, slug: r.slug, title: r.title });
        console.log(`✅ ${r.slug.padEnd(40)} ${r.title.slice(0, 70)}`);
      }
    }
  }

  const AU_STATES = /Western Australia|New South Wales|Victoria|Queensland|South Australia|Tasmania|Australian Capital Territory|Northern Territory/i;
  const auHits = hits.filter((h) => AU_STATES.test(h.title));

  // Dedupe by title
  const byTitle = new Map<string, typeof hits[0]>();
  for (const h of auHits) if (!byTitle.has(h.title)) byTitle.set(h.title, h);

  console.log(`\n=== ${byTitle.size} confirmed AU Chronogolf courses ===\n`);
  for (const h of byTitle.values()) {
    console.log(`${h.slug.padEnd(40)} ${h.title.replace("Book ", "").replace(" Tee Times", "").slice(0, 85)}`);
  }
}

main().catch(console.error);
