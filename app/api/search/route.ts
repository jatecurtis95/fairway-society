import { NextResponse } from "next/server";
import { z } from "zod";
import { findNearbyCourses, findCoursesByName, findRandomCourses } from "@/lib/supabase";
import { resolveAuPostcode } from "@/lib/postcode";
import { scrapeMiClub } from "@/lib/scrapers/miclub";
import { scrapeQuick18 } from "@/lib/scrapers/quick18";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds (Vercel)

const BodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  players: z.number().int().min(1).max(4),
  radiusKm: z.number().min(1).max(500),
  lat: z.number().optional(),
  lng: z.number().optional(),
  postcode: z.string().optional(),
  courseQuery: z.string().trim().min(2).optional(),
  random: z.boolean().optional(),
});

type Result = {
  course: string;
  courseUrl: string;
  date: string;
  time: string;
  playersAvailable: number;
  bookingUrl: string;
  distanceKm?: number;
  lat?: number;
  lng?: number;
  suburb?: string;
  state?: string;
  imageUrl?: string;
  gameType: string;
  layout: string;
  price?: number;
};

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let { lat, lng } = body;
  let courses: Awaited<ReturnType<typeof findNearbyCourses>>;

  // Resolve postcode → coords if needed (used by both nearby + random with location)
  if ((lat === undefined || lng === undefined) && body.postcode) {
    const resolved = await resolveAuPostcode(body.postcode);
    if (resolved) {
      lat = resolved.lat;
      lng = resolved.lng;
    }
  }

  if (body.random) {
    if (lat !== undefined && lng !== undefined) {
      // Random within the user's radius — shuffle nearby courses and take 12
      const nearby = await findNearbyCourses(lat, lng, body.radiusKm);
      if (!nearby.length) {
        return NextResponse.json({ results: [], error: `No courses found within ${body.radiusKm}km. Try widening the radius.` });
      }
      courses = [...nearby].sort(() => Math.random() - 0.5).slice(0, 12);
    } else {
      courses = await findRandomCourses(12);
    }
  } else if (body.courseQuery) {
    courses = await findCoursesByName(body.courseQuery);
  } else {
    if (lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: "Location required. Use 'Use My Location', enter a postcode, or search by course name." },
        { status: 400 }
      );
    }
    courses = await findNearbyCourses(lat, lng, body.radiusKm);
  }
  if (!courses.length) {
    return NextResponse.json({ results: [] });
  }

  // Cap concurrent scrapes so we don't hammer the target hosts or blow the timeout.
  const maxCourses = 25;
  const target = courses.slice(0, maxCourses);

  // Track which courses returned slots
  const coursesWithSlots = new Set<string>();

  const perCourse = await Promise.all(
    target.map(async (c) => {
      try {
        const slots = c.platform === "quick18"
          ? await scrapeQuick18(c.booking_url, body.date)
          : await scrapeMiClub(c.booking_url, body.date);
        const matched = slots
          .filter((s) => s.availableSpots >= body.players)
          .map<Result>((s) => ({
            course: c.name,
            courseUrl: c.booking_url,
            date: body.date,
            time: s.time,
            playersAvailable: s.availableSpots,
            bookingUrl: s.bookingUrl,
            distanceKm: c.distance_km,
            lat: c.lat,
            lng: c.lng,
            suburb: c.suburb ?? undefined,
            state: c.state ?? undefined,
            imageUrl: c.image_url ?? undefined,
            gameType: s.gameType,
            layout: s.layout,
            price: s.price,
          }));
        if (matched.length > 0) coursesWithSlots.add(c.name);
        return matched;
      } catch {
        return [] as Result[];
      }
    })
  );

  // Dedupe (course, time) — MiClub returns the same slot under multiple game types
  // (18 Hole, 9 Hole, Twilight, etc.). Keep the one with the highest availability,
  // and concatenate layouts so the UI can still surface them.
  const merged = new Map<string, Result>();
  for (const r of perCourse.flat()) {
    const key = `${r.course}|${r.time}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, r);
      continue;
    }
    // Keep lowest price across merged slots
    const minPrice = [existing.price, r.price].filter((p): p is number => p !== undefined);
    const bestPrice = minPrice.length > 0 ? Math.min(...minPrice) : undefined;
    if (r.playersAvailable > existing.playersAvailable) {
      merged.set(key, {
        ...r,
        layout: `${existing.layout} / ${r.layout}`,
        gameType: `${existing.gameType} / ${r.gameType}`,
        price: bestPrice,
      });
    } else {
      existing.layout = `${existing.layout} / ${r.layout}`;
      existing.gameType = `${existing.gameType} / ${r.gameType}`;
      existing.price = bestPrice;
    }
  }

  let results = [...merged.values()].sort((a, b) => {
    const d = (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
    if (d !== 0) return d;
    return a.time.localeCompare(b.time);
  });

  if (body.random && results.length) {
    const randomCourses = [...new Set(results.map((r) => r.course))];
    const pick = randomCourses[Math.floor(Math.random() * randomCourses.length)];
    results = results.filter((r) => r.course === pick);
  }

  // Build list of courses with no available tee times (private / members only)
  const privateCourses = target
    .filter((c) => !coursesWithSlots.has(c.name))
    .map((c) => ({
      course: c.name,
      courseUrl: c.booking_url,
      distanceKm: c.distance_km,
      lat: c.lat,
      lng: c.lng,
      suburb: c.suburb ?? undefined,
      state: c.state ?? undefined,
      imageUrl: c.image_url ?? undefined,
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  return NextResponse.json({ results, privateCourses });
}
