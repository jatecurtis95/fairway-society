/**
 * For a sample of Chronogolf AU pages, determine if they're truly bookable via Chronogolf
 * or just directory listings that redirect to a different platform.
 * Run: npx tsx scripts/verify-chronogolf.ts
 */
const UA = "TheFairwaySociety/1.0";

const SLUGS = [
  "albert-park-golf-course",        // known bookable
  "burswood-park-golf-course",
  "mount-lawley-golf-club",
  "cranbourne-golf-club",
  "corinda-golf-course",
  "sorrento-golf-club",
  "royal-sydney-golf-club",         // likely members only
  "kingston-heath-golf-club",       // likely members only
  "new-south-wales-golf-club",      // members only
  "pennant-hills-golf-club",
  "roseville-golf-club",
  "elanora-country-club",
  "kogarah-golf-club",
  "sanctuary-golf-resort",
  "sea-view-golf-club",
];

type Verdict = "BOOKABLE" | "DIRECTORY_MICLUB" | "DIRECTORY_OTHER" | "UNCLEAR";

async function verify(slug: string): Promise<{ slug: string; verdict: Verdict; evidence: string }> {
  const res = await fetch(`https://www.chronogolf.com/club/${slug}`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });
  const html = await res.text();

  // Strong "bookable via Chronogolf" signals
  const chronogolfReserve = /chronogolf\.com\/(?:en\/)?(?:club|reserve|tee-times)\/[a-z0-9-]+\/?(?:widget|reserve|book)/i.test(html)
    || /app\.chronogolf\.com/i.test(html)
    || /"widget_url"|"reservation_url"|reservations\/new/i.test(html);

  // Strong "not actually bookable here" signals
  const miclubRef = /miclub\.com\.au/i.test(html);
  const otherBookingSystem = /golfbox\.(dk|com|net)|quick18\.com|migolf\.com/i.test(html);
  const externalBookingLink = html.match(/href="(https?:\/\/(?!www\.chronogolf\.com)[^"]+(?:booking|book|tee-times?)[^"]*)"/i);

  // Count tee data signals (these show on real Chronogolf-booking clubs even for tee info tables)
  const hasTeeInfo = /Tee Times available|book your tee time|Reserve Now|Select a date|Book Now/i.test(html);

  let verdict: Verdict = "UNCLEAR";
  let evidence = "";

  if (miclubRef) {
    verdict = "DIRECTORY_MICLUB";
    const m = html.match(/https?:\/\/[a-z0-9-]+\.miclub\.com\.au[^\s"'<>]*/i);
    evidence = m ? m[0].slice(0, 80) : "miclub.com.au referenced";
  } else if (otherBookingSystem) {
    verdict = "DIRECTORY_OTHER";
    const m = html.match(/(golfbox|quick18|migolf)[^\s"'<>]{0,60}/i);
    evidence = m ? m[0] : "other platform referenced";
  } else if (chronogolfReserve) {
    verdict = "BOOKABLE";
    const m = html.match(/(?:widget_url|reservation_url|app\.chronogolf\.com[^"<>]*)/i);
    evidence = m ? m[0].slice(0, 80) : "chronogolf reservation endpoint";
  } else if (externalBookingLink && !externalBookingLink[1].includes("chronogolf.com")) {
    verdict = "DIRECTORY_OTHER";
    evidence = externalBookingLink[1].slice(0, 80);
  } else if (hasTeeInfo) {
    verdict = "UNCLEAR";
    evidence = "has 'Book Now' text but no clear reservation endpoint";
  }

  return { slug, verdict, evidence };
}

async function main() {
  const results = await Promise.all(SLUGS.map(verify));
  console.log("\n=== Chronogolf bookability check ===\n");
  const tally = new Map<Verdict, number>();
  for (const r of results) {
    tally.set(r.verdict, (tally.get(r.verdict) ?? 0) + 1);
    const icon = r.verdict === "BOOKABLE" ? "✅" : r.verdict === "UNCLEAR" ? "❓" : "❌";
    console.log(`${icon} ${r.slug.padEnd(32)} ${r.verdict.padEnd(18)} ${r.evidence}`);
  }
  console.log("\n=== Tally ===");
  for (const [v, n] of tally) console.log(`${v.padEnd(20)} ${n}`);
}

main().catch(console.error);
