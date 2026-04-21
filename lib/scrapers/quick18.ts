import * as cheerio from "cheerio";
import type { TeeSlot } from "./miclub";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Parse the "players" cell text into a max player count.
 * Examples: "1 to 4 players" → 4, "1 or 2 players" → 2, "1 player" → 1
 */
function parseMaxPlayers(text: string): number {
  const m = text.match(/(\d+)\s*player/i);
  if (!m) return 0;
  // "1 to 4 players" — grab the last number before "player"
  const nums = [...text.matchAll(/(\d+)/g)].map((x) => Number(x[1]));
  return Math.max(...nums, 0);
}

/**
 * Convert Quick18 date format (YYYY-MM-DD) to their query param (YYYYMMDD).
 */
function toQ18Date(dateIso: string): string {
  return dateIso.replace(/-/g, "");
}

/**
 * Scrape a Quick18 searchmatrix page for tee time availability.
 *
 * URL pattern: https://<slug>.quick18.com/teetimes/searchmatrix?teedate=YYYYMMDD
 */
export async function scrapeQuick18(
  baseUrl: string,
  dateIso: string,
  signal?: AbortSignal
): Promise<TeeSlot[]> {
  const url = new URL(baseUrl);
  // Ensure we hit the searchmatrix page
  if (!url.pathname.includes("searchmatrix")) {
    url.pathname = "/teetimes/searchmatrix";
  }
  url.searchParams.set("teedate", toQ18Date(dateIso));

  const res = await fetch(url.toString(), {
    headers: { "user-agent": UA, accept: "text/html" },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Quick18 fetch ${res.status} for ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Parse column headers to get game types (e.g. "9 Holes", "18 holes", "Twilight")
  const gameTypes: string[] = [];
  $("table.matrixTable thead th.matrixHdrSched").each((_, th) => {
    gameTypes.push($(th).text().trim());
  });

  const slots: TeeSlot[] = [];

  $("table.matrixTable tbody tr").each((_, row) => {
    const $row = $(row);

    // Parse time: "6:55" + "AM" from the ampm div
    const timeCell = $row.find("td.mtrxTeeTimes");
    if (!timeCell.length) return;
    const timeNum = timeCell.contents().first().text().trim();
    const ampm = timeCell.find(".be_tee_time_ampm").text().trim();
    if (!timeNum) return;
    const time = `${timeNum} ${ampm}`.trim();

    // Parse course/layout
    const layout = $row.find("td.mtrxCourse").text().trim() || "Course";

    // Parse max players available
    const playersText = $row.find("td.matrixPlayers").text().trim();
    const availableSpots = parseMaxPlayers(playersText);

    // Check each schedule column for active (bookable) slots
    const schedCells = $row.find("td.matrixsched");
    schedCells.each((i, cell) => {
      const $cell = $(cell);
      // Skip inactive slots
      if ($cell.hasClass("mtrxInactive")) return;
      // Must have a "Select" booking link
      const bookLink = $cell.find("a.sexybutton.teebutton").attr("href");
      if (!bookLink) return;

      const gameType = gameTypes[i] || "Golf";
      const bookingUrl = new URL(bookLink, url.origin).toString();

      slots.push({
        time,
        availableSpots,
        layout,
        gameType,
        bookingUrl,
      });
    });
  });

  return slots;
}
