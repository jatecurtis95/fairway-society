import { NextResponse } from "next/server";
import { z } from "zod";
import { findNearbyCourses } from "@/lib/supabase";
import { resolveAuPostcode } from "@/lib/postcode";
import { scrapeMiClub } from "@/lib/scrapers/miclub";

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
});

type Result = {
  course: string;
  courseUrl: string;
  date: string;
  time: string;
  playersAvailable: number;
  bookingUrl: string;
  distanceKm?: number;
};

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let { lat, lng } = body;
  if ((lat === undefined || lng === undefined) && body.postcode) {
    const resolved = await resolveAuPostcode(body.postcode);
    if (resolved) {
      lat = resolved.lat;
      lng = resolved.lng;
    }
  }
  if (lat === undefined || lng === undefined) {
    return NextResponse.json(
      { error: "Location required. Use 'Use My Location' or enter a postcode." },
      { status: 400 }
    );
  }

  const courses = await findNearbyCourses(lat, lng, body.radiusKm);
  if (!courses.length) {
    return NextResponse.json({ results: [] });
  }

  // Cap concurrent scrapes so we don't hammer the target hosts or blow the timeout.
  const maxCourses = 15;
  const target = courses.slice(0, maxCourses);

  const perCourse = await Promise.all(
    target.map(async (c) => {
      if (c.platform !== "miclub") return [] as Result[]; // Quick18 TBD
      try {
        const slots = await scrapeMiClub(c.booking_url, body.date);
        return slots
          .filter((s) => s.availableSpots >= body.players)
          .map<Result>((s) => ({
            course: c.name,
            courseUrl: c.booking_url,
            date: body.date,
            time: s.time,
            playersAvailable: s.availableSpots,
            bookingUrl: s.bookingUrl,
            distanceKm: c.distance_km,
          }));
      } catch {
        return [] as Result[];
      }
    })
  );

  const results = perCourse
    .flat()
    .sort((a, b) => {
      const d = (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      if (d !== 0) return d;
      return a.time.localeCompare(b.time);
    });

  return NextResponse.json({ results });
}
