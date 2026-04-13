# The Fairway Society

Next.js 16 site for `thefairwaysociety.com.au`.

- **`/`** — marketing site (served pixel-perfect from `public/index.html`)
- **`/tee-times`** — live tee-time finder across MiClub courses in Australia
- **`/api/search`** — POST endpoint that queries nearby courses from Supabase and scrapes them in parallel

---

## Handoff — what Jate needs to do

All the code is written. These are the one-time setup steps that need your login.

### 1. Supabase (database for course list)
1. Go to https://supabase.com → new project (free tier is fine). Call it **fairway-society**.
2. Once created, open **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this one secret)
3. Open **SQL Editor**, paste in the contents of `supabase/schema.sql`, run it.

### 2. Local env
Create `.env.local` in the project root (copy from `.env.example`) and paste the three keys above.

### 3. Seed the course list
1. Edit `scripts/courses.csv` — add every course you want searchable (name, slug, platform=`miclub`, booking_url, lat, lng, etc.). The two starter rows are guesses — **verify the booking URLs actually work** by opening them in a browser before seeding.
2. Run:
   ```bash
   npm run seed
   ```

### 4. GitHub + Vercel
1. Create a new GitHub repo (private is fine).
2. Push this folder up.
3. On https://vercel.com → Import the repo → add the three Supabase env vars in the Vercel project settings.
4. Deploy.

### 5. Point the domain
1. Vercel project → **Settings → Domains** → add `thefairwaysociety.com.au`.
2. Vercel shows DNS records.
3. GoDaddy → DNS management → add the records Vercel shows (usually `A` for root + `CNAME` for `www`).
4. Wait 5–30 min for propagation.

---

## Running locally
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Build
```bash
npm run build
```

---

## Architecture

```
app/
  layout.tsx          # global metadata + font imports
  globals.css         # design tokens (cream/green/gold) + shared components
  tee-times/page.tsx  # search UI (client component)
  api/search/route.ts # POST /api/search — runs scrapers server-side

components/
  SiteNav.tsx         # shared top nav for Next.js pages

lib/
  supabase.ts         # Supabase client + nearby_courses RPC
  postcode.ts         # AU postcode -> lat/lng (Nominatim, no API key)
  scrapers/miclub.ts  # MiClub scraper — TS port of the Go original

public/
  index.html          # existing marketing site, served at /
  logo.png

supabase/
  schema.sql          # run once in Supabase SQL editor

scripts/
  seed-courses.ts     # upsert courses from CSV
  courses.csv         # course list (edit this)
```

## Follow-ups
- **Quick18 scraper** — only MiClub is ported. Most Aussie courses are MiClub; some use Quick18 (Sagacity). Add to `lib/scrapers/` and branch in the API route.
- **Auto-seed** — could scrape the MiClub directory to pre-populate every AU course.
- **Caching** — short-TTL cache keyed by `(courseId, date)` to speed repeat searches.

---

Scraping approach adapted from [Ay1tsMe/TeeTimeFinder](https://github.com/Ay1tsMe/TeeTimeFinder) (Go), ported to TypeScript.
