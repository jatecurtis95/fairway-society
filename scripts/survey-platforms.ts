/**
 * Survey which booking platform major AU courses use.
 * Fetches their public homepage + known booking paths and looks for platform markers.
 *
 * Run: npx tsx scripts/survey-platforms.ts
 */

const UA = "TheFairwaySociety/1.0 (contact@thefairwaysociety.com.au)";

// Prominent AU courses + their main website. Focus on ones NOT already in our MiClub DB.
const COURSES: { name: string; state: string; site: string }[] = [
  // WA — missing from current DB
  { name: "Joondalup Resort", state: "WA", site: "https://www.joondalupresort.com.au" },
  { name: "Lake Karrinyup Country Club", state: "WA", site: "https://www.lakekarrinyup.com.au" },
  { name: "The Vines Resort", state: "WA", site: "https://www.vines.com.au" },
  { name: "Mount Lawley Golf Club", state: "WA", site: "https://www.mountlawleygolf.com.au" },
  { name: "Royal Perth Golf Club", state: "WA", site: "https://www.royalperthgolf.com" },
  { name: "Kennedy Bay Golf Links", state: "WA", site: "https://www.kennedybaygolflinks.com.au" },
  { name: "The Cut Golf Course", state: "WA", site: "https://www.thecut.com.au" },
  { name: "Araluen Golf Resort", state: "WA", site: "https://www.araluengolf.com.au" },
  { name: "Joondalup Ladies Golf Club", state: "WA", site: "https://joondalupladies.com.au" },
  // NSW
  { name: "New South Wales Golf Club", state: "NSW", site: "https://www.nswgolfclub.com.au" },
  { name: "St Michael's Golf Club", state: "NSW", site: "https://www.stmichaelsgolf.com.au" },
  { name: "Pennant Hills Golf Club", state: "NSW", site: "https://www.pennanthillsgolf.com.au" },
  { name: "Elanora Country Club", state: "NSW", site: "https://www.elanora.com.au" },
  { name: "Moore Park Golf", state: "NSW", site: "https://www.mooreparkgolf.com.au" },
  { name: "Roseville Golf Club", state: "NSW", site: "https://rosevillegolf.com.au" },
  { name: "Castle Hill Country Club", state: "NSW", site: "https://www.castlehillcc.com.au" },
  // VIC
  { name: "Royal Melbourne Golf Club", state: "VIC", site: "https://www.royalmelbourne.com.au" },
  { name: "Kingston Heath Golf Club", state: "VIC", site: "https://www.kingstonheath.com.au" },
  { name: "Huntingdale Golf Club", state: "VIC", site: "https://www.huntingdalegolf.com.au" },
  { name: "Metropolitan Golf Club", state: "VIC", site: "https://www.metropolitangolf.com.au" },
  { name: "Commonwealth Golf Club", state: "VIC", site: "https://commonwealthgolf.com.au" },
  { name: "Peninsula Kingswood", state: "VIC", site: "https://www.peninsulakingswood.com.au" },
  { name: "Sandringham Golf Links", state: "VIC", site: "https://www.sandygolflinks.com.au" },
  { name: "Albert Park Golf Course", state: "VIC", site: "https://www.albertparkgolf.com.au" },
  // QLD
  { name: "Royal Queensland Golf Club", state: "QLD", site: "https://www.royalqueensland.com" },
  { name: "Brisbane Golf Club", state: "QLD", site: "https://www.brisbanegolfclub.com.au" },
  { name: "Pacific Harbour Golf", state: "QLD", site: "https://www.pacificharbour.com.au" },
  { name: "Sanctuary Cove Golf", state: "QLD", site: "https://www.sanctuarycove.com" },
  { name: "Hope Island Golf", state: "QLD", site: "https://www.hopeislandgolf.com.au" },
  { name: "RACV Royal Pines", state: "QLD", site: "https://www.racv.com.au/travel-leisure/racv-resorts/our-resorts/royal-pines-resort.html" },
  // SA
  { name: "Adelaide Shores Golf Park", state: "SA", site: "https://www.adelaideshoresgolf.com.au" },
  { name: "Mount Osmond Golf Club", state: "SA", site: "https://www.mountosmondgolf.com.au" },
  { name: "Flagstaff Hill Golf Club", state: "SA", site: "https://www.flagstaffhillgolf.com.au" },
  // TAS
  { name: "Barnbougle Dunes", state: "TAS", site: "https://www.barnbougle.com.au" },
  { name: "Cape Wickham Links", state: "TAS", site: "https://www.capewickham.com.au" },
];

const MARKERS: { platform: string; patterns: RegExp[] }[] = [
  { platform: "MiClub", patterns: [/miclub\.com\.au/i, /feeGroupRow/i, /redirectToTimesheet/i] },
  { platform: "Quick18", patterns: [/quick18\.com/i, /\.quick18\./i] },
  { platform: "MiGolf", patterns: [/migolf\.com/i, /\.migolf\./i] },
  { platform: "GolfBox", patterns: [/golfbox\.dk/i, /golfbox\.com/i, /golfbox\.net/i] },
  { platform: "Chronogolf", patterns: [/chronogolf\.com/i] },
  { platform: "TeeOn", patterns: [/teeon\.com/i] },
  { platform: "Lightspeed", patterns: [/lightspeedhq\.com/i, /chronogolf/i] },
  { platform: "ClubHub", patterns: [/clubhub\.com\.au/i] },
  { platform: "GolfClubAdmin", patterns: [/golfclubadmin\.com/i] },
  { platform: "TeeBook", patterns: [/teebook\./i] },
];

async function fetchText(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function detectPlatforms(html: string): string[] {
  const found = new Set<string>();
  for (const { platform, patterns } of MARKERS) {
    if (patterns.some((p) => p.test(html))) found.add(platform);
  }
  return [...found];
}

async function surveyOne(c: { name: string; state: string; site: string }): Promise<{
  name: string;
  state: string;
  platforms: string[];
  bookingUrl: string | null;
}> {
  // Try homepage + common booking paths
  const paths = ["", "/bookings", "/book", "/tee-times", "/booking", "/guest-bookings", "/golf"];
  const htmls: string[] = [];
  for (const p of paths) {
    const url = `${c.site.replace(/\/$/, "")}${p}`;
    const html = await fetchText(url);
    if (html) htmls.push(html);
  }

  const combined = htmls.join("\n");
  const platforms = detectPlatforms(combined);

  // Try to pull a booking URL if detected
  let bookingUrl: string | null = null;
  const urlMatch = combined.match(/https?:\/\/[^\s"'<>]*?(miclub|quick18|migolf|golfbox|chronogolf)[^\s"'<>]*/i);
  if (urlMatch) bookingUrl = urlMatch[0];

  return { name: c.name, state: c.state, platforms, bookingUrl };
}

async function main() {
  console.log(`Surveying ${COURSES.length} courses...\n`);

  const results: Awaited<ReturnType<typeof surveyOne>>[] = [];
  const batchSize = 6;
  for (let i = 0; i < COURSES.length; i += batchSize) {
    const batch = COURSES.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(surveyOne));
    results.push(...batchResults);
    for (const r of batchResults) {
      const tag = r.platforms.length ? r.platforms.join(", ") : "—";
      console.log(`[${r.state}] ${r.name.padEnd(40)} → ${tag}`);
    }
  }

  // Tally
  const tally = new Map<string, number>();
  let unknown = 0;
  for (const r of results) {
    if (!r.platforms.length) { unknown++; continue; }
    for (const p of r.platforms) tally.set(p, (tally.get(p) ?? 0) + 1);
  }

  console.log("\n=== TALLY ===");
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  for (const [p, n] of sorted) console.log(`${p.padEnd(15)} ${n}`);
  console.log(`${"Unknown".padEnd(15)} ${unknown}`);
  console.log(`\nTotal surveyed: ${results.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
