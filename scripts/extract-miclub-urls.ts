/**
 * For courses whose website references miclub.com.au, extract the actual subdomain.
 * Run: npx tsx scripts/extract-miclub-urls.ts
 */

const UA = "TheFairwaySociety/1.0";

const SITES: { name: string; state: string; site: string }[] = [
  { name: "Joondalup Resort", state: "WA", site: "https://www.joondalupresort.com.au" },
  { name: "The Vines Resort", state: "WA", site: "https://www.vines.com.au" },
  { name: "New South Wales Golf Club", state: "NSW", site: "https://www.nswgolfclub.com.au" },
  { name: "St Michael's Golf Club", state: "NSW", site: "https://www.stmichaelsgolf.com.au" },
  { name: "Moore Park Golf", state: "NSW", site: "https://www.mooreparkgolf.com.au" },
  { name: "Royal Melbourne Golf Club", state: "VIC", site: "https://www.royalmelbourne.com.au" },
  { name: "Huntingdale Golf Club", state: "VIC", site: "https://www.huntingdalegolf.com.au" },
  { name: "Metropolitan Golf Club", state: "VIC", site: "https://www.metropolitangolf.com.au" },
  { name: "Commonwealth Golf Club", state: "VIC", site: "https://commonwealthgolf.com.au" },
  { name: "Peninsula Kingswood", state: "VIC", site: "https://www.peninsulakingswood.com.au" },
  { name: "Brisbane Golf Club", state: "QLD", site: "https://www.brisbanegolfclub.com.au" },
];

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    return await res.text();
  } catch { return ""; }
}

async function main() {
  for (const s of SITES) {
    const paths = ["", "/bookings", "/book", "/tee-times", "/golf", "/booking"];
    let found = new Set<string>();
    for (const p of paths) {
      const html = await fetchText(`${s.site.replace(/\/$/, "")}${p}`);
      const matches = html.match(/https?:\/\/([a-z0-9-]+)\.miclub\.com\.au[^\s"'<>]*/gi);
      if (matches) matches.forEach((m) => found.add(m));
    }
    const urls = [...found].slice(0, 3);
    console.log(`${s.name.padEnd(35)} → ${urls.length ? urls.join("  |  ") : "(none found)"}`);
  }
}

main().catch(console.error);
