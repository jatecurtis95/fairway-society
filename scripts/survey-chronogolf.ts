/**
 * Fetch Chronogolf's AU directory and list all courses.
 * Run: npx tsx scripts/survey-chronogolf.ts
 */
const UA = "TheFairwaySociety/1.0";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function main() {
  const states = ["Australia", "Western-Australia", "New-South-Wales", "Victoria", "Queensland", "South-Australia", "Tasmania", "Australian-Capital-Territory"];
  const allCourses = new Map<string, { name: string; slug: string; url: string; region: string }>();

  for (const region of states) {
    try {
      const html = await fetchText(`https://www.chronogolf.com/clubs/${region}`);
      // Extract club slugs: href="/club/<slug>" or href="/en/club/<slug>"
      const matches = [...html.matchAll(/href="\/(?:en\/)?club\/([a-z0-9-]+)"/gi)];
      for (const m of matches) {
        const slug = m[1];
        if (!allCourses.has(slug)) {
          // Try to find a nearby title
          const idx = m.index ?? 0;
          const around = html.slice(Math.max(0, idx - 200), idx + 300);
          const titleMatch = around.match(/>([^<>]{3,80})<\/(?:a|h[1-6]|span|div)>/);
          const name = titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : slug;
          allCourses.set(slug, { name, slug, url: `https://www.chronogolf.com/club/${slug}`, region });
        }
      }
      console.log(`${region.padEnd(30)} → +${matches.length} hrefs, total unique: ${allCourses.size}`);
    } catch (e) {
      console.log(`${region.padEnd(30)} ERROR: ${(e as Error).message}`);
    }
  }

  console.log(`\n=== ${allCourses.size} unique Chronogolf AU courses ===\n`);
  for (const c of allCourses.values()) {
    console.log(`${c.name.padEnd(45)} ${c.slug}`);
  }
}

main().catch(console.error);
