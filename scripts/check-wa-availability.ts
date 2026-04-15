/**
 * For each WA course, run the actual scrapeMiClub for today + the next few days,
 * and report how many tee slots are publicly visible.
 * Run: npx tsx scripts/check-wa-availability.ts
 */
import { scrapeMiClub } from "../lib/scrapers/miclub";

const WA_COURSES: { name: string; url: string }[] = [
  { name: "Collier Park", url: "https://collierpark.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Cottesloe", url: "https://cottesloe.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Fremantle Public", url: "https://fremantlepublic.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Gosnells", url: "https://gosnells.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Hartfield", url: "https://hartfield.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Joondalup", url: "https://joondalup.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Mandurah CC", url: "https://mandurahcc.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Marangaroo", url: "https://marangaroo.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Maylands Peninsula", url: "https://maylandsembleton.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Meadow Springs", url: "https://meadowsprings.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Melville Glades", url: "https://melville.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Mosman Park", url: "https://mosman.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Point Walter", url: "https://pointwalter.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Royal Fremantle", url: "https://royalfremantle.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Sea View", url: "https://seaview.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Secret Harbour", url: "https://secretharbour.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Sun City", url: "https://suncity.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "The Vines", url: "https://thevines.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Wembley", url: "https://wembley.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
  { name: "Whaleback", url: "https://whaleback.miclub.com.au/guests/bookings/ViewPublicCalendar.msp?booking_resource_id=3000000" },
];

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

async function main() {
  const today = new Date();
  const dates = [0, 1, 2, 3, 7].map((n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return ymd(d);
  });
  console.log(`Checking ${WA_COURSES.length} WA courses across dates: ${dates.join(", ")}\n`);

  for (const c of WA_COURSES) {
    const counts = await Promise.all(
      dates.map(async (date) => {
        try {
          const slots = await scrapeMiClub(c.url, date);
          return slots.length;
        } catch {
          return -1;
        }
      })
    );
    const total = counts.reduce((a, b) => a + Math.max(0, b), 0);
    const flag = total > 0 ? "✅" : counts.some((n) => n < 0) ? "⚠️ " : "🔒";
    console.log(`${flag} ${c.name.padEnd(25)} ${counts.map((n, i) => `${dates[i]}=${n < 0 ? "ERR" : n}`).join("  ")}`);
  }

  console.log("\n🔒 = no public slots in the next week (likely members-only, or no public calendar)");
  console.log("⚠️ = scraper error on at least one date");
}

main().catch(console.error);
