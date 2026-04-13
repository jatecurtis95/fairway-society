import * as cheerio from "cheerio";

export type TeeSlot = {
  time: string;
  availableSpots: number;
  layout: string;
  gameType: string;
  bookingUrl: string;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
    signal,
    // MiClub pages are slow-changing — Next caches server fetches by default.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MiClub fetch ${res.status} for ${url}`);
  return res.text();
}

function buildTimesheetUrl(baseUrl: string, onclickAttr: string): string | null {
  const m = onclickAttr.match(/\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => p.trim().replace(/^['"]|['"]$/g, ""));
  if (parts.length !== 2) return null;
  const [feeGroupId, selectedDate] = parts;
  const u = new URL(baseUrl);
  u.pathname = "/guests/bookings/ViewPublicTimesheet.msp";
  const q = u.searchParams;
  q.set("feeGroupId", feeGroupId);
  q.set("selectedDate", selectedDate);
  q.set("weekends", "false");
  return u.toString();
}

async function scrapeDates(
  baseUrl: string,
  dateIso: string,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const u = new URL(baseUrl);
  u.searchParams.set("selectedDate", dateIso);
  u.searchParams.set("weekends", "false");

  const html = await fetchHtml(u.toString(), signal);
  const $ = cheerio.load(html);

  const result: Record<string, string> = {};
  $("div.feeGroupRow").each((_, row) => {
    const heading = $(row).find("div.row-heading > h3").text().trim();
    if (!heading) return;
    const cell = $(row).find("div.items-wrapper > div.cell[data-date='0']").first();
    if (!cell.length) return;
    const cellText = cell.text().trim().toLowerCase();
    if (
      cellText === "" ||
      cellText.includes("not available") ||
      cellText.includes("no bookings available")
    ) {
      return;
    }
    const onclick = cell.attr("onclick");
    if (!onclick || !onclick.includes("redirectToTimesheet")) return;
    const tsUrl = buildTimesheetUrl(baseUrl, onclick);
    if (tsUrl) result[heading] = tsUrl;
  });
  return result;
}

async function scrapeTimes(
  timesheetUrl: string,
  signal?: AbortSignal
): Promise<{ time: string; availableSpots: number; layout: string }[]> {
  const html = await fetchHtml(timesheetUrl, signal);
  const $ = cheerio.load(html);
  const out: { time: string; availableSpots: number; layout: string }[] = [];
  $("div.row-time").each((_, row) => {
    const time = $(row).find("div.time-wrapper > h3").text().trim();
    const layout = $(row).find("div.time-wrapper > h4").text().trim();
    if (!time || !layout) return;
    const availableSpots = $(row).find("div.cell.cell-available").length;
    if (availableSpots > 0) out.push({ time, availableSpots, layout });
  });
  return out;
}

export async function scrapeMiClub(
  baseUrl: string,
  dateIso: string,
  signal?: AbortSignal
): Promise<TeeSlot[]> {
  const games = await scrapeDates(baseUrl, dateIso, signal);
  const entries = Object.entries(games);
  const all = await Promise.all(
    entries.map(async ([gameType, tsUrl]) => {
      try {
        const slots = await scrapeTimes(tsUrl, signal);
        return slots.map((s) => ({ ...s, gameType, bookingUrl: tsUrl }));
      } catch {
        return [] as TeeSlot[];
      }
    })
  );
  return all.flat();
}
