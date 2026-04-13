"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import SiteNav from "@/components/SiteNav";
import CoursesMap from "@/components/CoursesMap";

type TeeTime = {
  course: string;
  courseUrl: string;
  date: string;
  time: string;
  playersAvailable: number;
  bookingUrl: string;
  distanceKm?: number;
  lat?: number;
  lng?: number;
  gameType: string;
  layout: string;
};

type SearchState = "idle" | "locating" | "loading" | "done" | "error";
type Daypart = "all" | "morning" | "midday" | "afternoon" | "twilight";
type HolesFilter = "all" | "9" | "18";
type SortKey = "nearest" | "earliest" | "most";

const DAYPARTS: { key: Daypart; label: string; range: string }[] = [
  { key: "all", label: "Any time", range: "All day" },
  { key: "morning", label: "Morning", range: "Before 12pm" },
  { key: "midday", label: "Midday", range: "12–3pm" },
  { key: "afternoon", label: "Afternoon", range: "3–6pm" },
  { key: "twilight", label: "Twilight", range: "After 6pm" },
];

// Parse "01:52pm" / "1:52 PM" / "13:45" into 0-23 hour.
function parseHour(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const ampm = m[3];
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h;
}

function inDaypart(time: string, dp: Daypart): boolean {
  if (dp === "all") return true;
  const h = parseHour(time);
  if (h === null) return true;
  if (dp === "morning") return h < 12;
  if (dp === "midday") return h >= 12 && h < 15;
  if (dp === "afternoon") return h >= 15 && h < 18;
  if (dp === "twilight") return h >= 18;
  return true;
}

function isHolesMatch(gameType: string, layout: string, f: HolesFilter): boolean {
  if (f === "all") return true;
  const blob = `${gameType} ${layout}`.toLowerCase();
  if (f === "9") return /\b9\s*hole/.test(blob);
  if (f === "18") return /\b18\s*hole/.test(blob) || (!/\b9\s*hole/.test(blob));
  return true;
}

function holesOf(gameType: string, layout: string): string | null {
  const blob = `${gameType} ${layout}`.toLowerCase();
  const has9 = /\b9\s*hole/.test(blob);
  const has18 = /\b18\s*hole/.test(blob);
  if (has9 && has18) return "9 & 18 holes";
  if (has18) return "18 holes";
  if (has9) return "9 holes";
  return null;
}

function groupHolesLabel(times: TeeTime[]): string {
  let has9 = false;
  let has18 = false;
  for (const t of times) {
    const blob = `${t.gameType} ${t.layout}`.toLowerCase();
    if (/\b9\s*hole/.test(blob)) has9 = true;
    if (/\b18\s*hole/.test(blob)) has18 = true;
    if (has9 && has18) break;
  }
  if (has9 && has18) return "9 & 18 holes";
  if (has18) return "18 holes";
  if (has9) return "9 holes";
  return "Mixed";
}

type CourseGroup = {
  course: string;
  distanceKm?: number;
  lat?: number;
  lng?: number;
  times: TeeTime[];
};

function groupByCourse(results: TeeTime[]): CourseGroup[] {
  const map = new Map<string, CourseGroup>();
  for (const r of results) {
    let g = map.get(r.course);
    if (!g) {
      g = {
        course: r.course,
        distanceKm: r.distanceKm,
        lat: r.lat,
        lng: r.lng,
        times: [],
      };
      map.set(r.course, g);
    }
    g.times.push(r);
  }
  return [...map.values()];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function TeeTimesPage() {
  const [state, setState] = useState<SearchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TeeTime[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [players, setPlayers] = useState(2);
  const [radiusKm, setRadiusKm] = useState(50);
  const [postcode, setPostcode] = useState("");

  const [daypart, setDaypart] = useState<Daypart>("all");
  const [holes, setHoles] = useState<HolesFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("nearest");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const courseRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleSelectPin = useCallback((key: string) => {
    setActiveCourse(key);
    const el = courseRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.setTimeout(() => setActiveCourse((k) => (k === key ? null : k)), 2000);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("fs_coords");
    if (saved) {
      try {
        const c = JSON.parse(saved);
        setCoords({ lat: c.lat, lng: c.lng });
        setLocationLabel(c.label ?? "Saved location");
      } catch {}
    }
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation not supported in this browser.");
      return;
    }
    setState("locating");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setLocationLabel("Current location");
        localStorage.setItem("fs_coords", JSON.stringify({ ...c, label: "Current location" }));
        setState("idle");
      },
      (err) => {
        setState("error");
        setError(err.message || "Unable to get your location.");
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setState("loading");
    setError(null);
    setResults([]);
    setExpanded({});
    try {
      const body = {
        date,
        players,
        radiusKm,
        lat: coords?.lat,
        lng: coords?.lng,
        postcode: postcode || undefined,
      };
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Search failed (${res.status})`);
      }
      const data = (await res.json()) as { results: TeeTime[] };
      setResults(data.results);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  const filtered = useMemo(() => {
    return results.filter(
      (r) =>
        inDaypart(r.time, daypart) &&
        isHolesMatch(r.gameType, r.layout, holes)
    );
  }, [results, daypart, holes]);

  const groups = useMemo(() => {
    const g = groupByCourse(filtered);
    g.forEach((c) =>
      c.times.sort((a, b) => (parseHour(a.time) ?? 99) - (parseHour(b.time) ?? 99))
    );
    if (sortKey === "nearest") {
      g.sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
    } else if (sortKey === "earliest") {
      g.sort(
        (a, b) =>
          (parseHour(a.times[0]?.time ?? "") ?? 99) -
          (parseHour(b.times[0]?.time ?? "") ?? 99)
      );
    } else if (sortKey === "most") {
      g.sort((a, b) => b.times.length - a.times.length);
    }
    return g;
  }, [filtered, sortKey]);

  const totalSlots = filtered.length;

  return (
    <>
      <SiteNav />
      <main className="page">
        {/* ===== HERO ===== */}
        <section className="section" style={{ paddingBottom: "2rem" }}>
          <div className="container">
            <div className="section-header" style={{ marginBottom: "2rem" }}>
              <span className="section-label">Tee Time Finder</span>
              <h1 className="section-title">Every course. One search.</h1>
              <div className="section-divider" />
              <p className="section-subtitle">
                Live availability across MiClub courses in Australia. Sorted by
                what&apos;s actually nearby.
              </p>
            </div>

            {/* ===== SEARCH BAR ===== */}
            <form
              onSubmit={search}
              className="search-bar"
            >
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Players</label>
                <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Radius</label>
                <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
                  {[10, 25, 50, 100, 250].map((n) => (
                    <option key={n} value={n}>{n} km</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Postcode</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  placeholder="e.g. 6000"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                />
              </div>
              <div className="search-bar-actions">
                <button
                  type="button"
                  onClick={useMyLocation}
                  className="btn btn-outline btn-compact"
                >
                  {state === "locating" ? "Locating..." : coords ? "Update" : "Use Location"}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-compact"
                  disabled={state === "loading"}
                >
                  {state === "loading" ? "Searching..." : "Search"}
                </button>
              </div>
            </form>

            {locationLabel && (
              <p className="location-hint">
                Searching near <strong>{locationLabel}</strong>
                {coords && ` · ${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}`}
              </p>
            )}
            {error && <div className="error-banner">{error}</div>}
          </div>
        </section>

        {/* ===== RESULTS ===== */}
        {(state === "done" || state === "loading") && (
          <section className="section" style={{ paddingTop: "1rem" }}>
            <div className="container">
              {state === "loading" && (
                <p className="empty">Searching courses near you…</p>
              )}

              {state === "done" && results.length === 0 && (
                <p className="empty">
                  No tee times found. Try widening the radius or a different date.
                </p>
              )}

              {results.length > 0 && (
                <>
                  <div className="toolbar">
                    <div className="chip-row">
                      {DAYPARTS.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => setDaypart(d.key)}
                          className={`chip ${daypart === d.key ? "chip-active" : ""}`}
                          title={d.range}
                        >
                          {d.label}
                        </button>
                      ))}
                      <span className="chip-divider" />
                      {(["all", "18", "9"] as HolesFilter[]).map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setHoles(h)}
                          className={`chip ${holes === h ? "chip-active" : ""}`}
                        >
                          {h === "all" ? "All holes" : `${h} holes`}
                        </button>
                      ))}
                    </div>

                    <div className="sort-row">
                      <span className="sort-label">Sort</span>
                      {(
                        [
                          ["nearest", "Nearest"],
                          ["earliest", "Earliest"],
                          ["most", "Most avail"],
                        ] as [SortKey, string][]
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSortKey(k)}
                          className={`sort-btn ${sortKey === k ? "sort-btn-active" : ""}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="results-header">
                    <p className="result-count">
                      {groups.length} course{groups.length === 1 ? "" : "s"} · {totalSlots} tee time
                      {totalSlots === 1 ? "" : "s"} available
                    </p>
                    <div className="view-toggle">
                      {(["list", "map"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setViewMode(m)}
                          className={`view-btn ${viewMode === m ? "view-btn-active" : ""}`}
                        >
                          {m === "list" ? "List" : "Map"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {viewMode === "map" && groups.some((g) => g.lat && g.lng) && (
                    <CoursesMap
                      pins={groups
                        .filter((g) => typeof g.lat === "number" && typeof g.lng === "number")
                        .map((g) => ({
                          key: slugify(g.course),
                          name: g.course,
                          lat: g.lat!,
                          lng: g.lng!,
                          slotCount: g.times.length,
                          isActive: activeCourse === slugify(g.course),
                        }))}
                      center={coords}
                      activeKey={activeCourse}
                      onSelect={handleSelectPin}
                    />
                  )}

                  {groups.length === 0 && (
                    <p className="empty">
                      No tee times match those filters. Try loosening them.
                    </p>
                  )}

                  <div className="course-list">
                    {groups.map((g) => {
                      const isExpanded = expanded[g.course] ?? false;
                      const visible = isExpanded ? g.times : g.times.slice(0, 12);
                      const hidden = g.times.length - visible.length;
                      const key = slugify(g.course);
                      const isHighlighted = activeCourse === key;
                      return (
                        <article
                          key={g.course}
                          ref={(el) => { courseRefs.current[key] = el; }}
                          className={`course-card ${isHighlighted ? "course-card-active" : ""}`}
                        >
                          <header className="course-head">
                            <div>
                              <h3 className="course-name">{g.course}</h3>
                              <p className="course-meta">
                                {typeof g.distanceKm === "number"
                                  ? `${g.distanceKm.toFixed(1)} km away`
                                  : "Distance unknown"}
                                {" · "}
                                {g.times.length} tee time
                                {g.times.length === 1 ? "" : "s"}
                              </p>
                            </div>
                            <span className="course-badge">
                              {groupHolesLabel(g.times)}
                            </span>
                          </header>

                          <div className="pill-row">
                            {visible.map((t, i) => (
                              <a
                                key={i}
                                href={t.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pill"
                                title={`${t.playersAvailable} available · ${t.layout}`}
                              >
                                <span className="pill-time">{t.time}</span>
                                <span className="pill-avail">
                                  {t.playersAvailable} avail
                                </span>
                              </a>
                            ))}
                            {hidden > 0 && (
                              <button
                                type="button"
                                className="pill pill-more"
                                onClick={() =>
                                  setExpanded((e) => ({ ...e, [g.course]: true }))
                                }
                              >
                                +{hidden} more
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <style jsx>{`
        .search-bar {
          background: var(--white);
          border: 1px solid var(--border);
          padding: 1.5rem;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1.25rem;
          align-items: end;
          position: sticky;
          top: 4.5rem;
          z-index: 50;
          box-shadow: 0 4px 20px rgba(27, 58, 45, 0.06);
        }
        .search-bar-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 140px;
        }
        .btn-compact {
          padding: 0.8rem 1rem;
          font-size: 0.7rem;
          letter-spacing: 2px;
        }
        .location-hint {
          font-size: 0.75rem;
          color: var(--text-body);
          margin-top: 1rem;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .location-hint strong {
          color: var(--green-dark);
        }
        .error-banner {
          margin-top: 1rem;
          padding: 1rem 1.25rem;
          border: 1px solid #c44;
          background: #fdecec;
          color: #8a2a2a;
          font-size: 0.85rem;
        }
        .empty {
          text-align: center;
          color: var(--text-body);
          padding: 3rem 0;
          font-size: 0.95rem;
          font-style: italic;
        }
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 1.5rem;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border);
        }
        .chip-row {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .chip {
          padding: 0.55rem 1rem;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-body);
          font-family: "Montserrat", sans-serif;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.25s;
        }
        .chip:hover {
          border-color: var(--gold);
          color: var(--gold);
        }
        .chip-active {
          background: var(--green-dark);
          color: var(--cream);
          border-color: var(--green-dark);
        }
        .chip-active:hover {
          background: var(--green-mid);
          color: var(--cream);
        }
        .chip-divider {
          width: 1px;
          height: 20px;
          background: var(--border);
          margin: 0 0.25rem;
        }
        .sort-row {
          display: flex;
          gap: 0.25rem;
          align-items: center;
        }
        .sort-label {
          font-size: 0.7rem;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--text-body);
          margin-right: 0.75rem;
        }
        .sort-btn {
          padding: 0.4rem 0.9rem;
          background: transparent;
          border: none;
          color: var(--text-body);
          font-family: "Montserrat", sans-serif;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.25s;
        }
        .sort-btn:hover {
          color: var(--green-dark);
        }
        .sort-btn-active {
          color: var(--green-dark);
          border-bottom-color: var(--gold);
        }
        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          gap: 1rem;
        }
        .result-count {
          font-size: 0.75rem;
          color: var(--text-body);
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .view-toggle {
          display: flex;
          border: 1px solid var(--border);
        }
        .view-btn {
          padding: 0.5rem 1.2rem;
          background: transparent;
          border: none;
          font-family: "Montserrat", sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--text-body);
          cursor: pointer;
          transition: all 0.2s;
        }
        .view-btn:hover {
          color: var(--green-dark);
        }
        .view-btn-active {
          background: var(--green-dark);
          color: var(--cream);
        }
        .course-card-active {
          border-color: var(--gold) !important;
          box-shadow: 0 8px 30px rgba(184, 150, 78, 0.25) !important;
        }
        .course-list {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .course-card {
          background: var(--white);
          border: 1px solid var(--border);
          padding: 1.75rem 2rem;
          transition: all 0.3s;
        }
        .course-card:hover {
          border-color: var(--gold);
          box-shadow: 0 8px 30px rgba(184, 150, 78, 0.1);
        }
        .course-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.25rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(184, 150, 78, 0.15);
        }
        .course-name {
          font-family: "Cormorant Garamond", serif;
          font-size: 1.5rem;
          font-weight: 500;
          color: var(--green-dark);
          line-height: 1.2;
          margin-bottom: 0.3rem;
        }
        .course-meta {
          font-size: 0.75rem;
          color: var(--text-body);
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .course-badge {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--gold);
          border: 1px solid var(--gold);
          padding: 0.35rem 0.75rem;
          white-space: nowrap;
        }
        .pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.1rem;
          padding: 0.55rem 0.9rem;
          min-width: 78px;
          background: var(--cream-light);
          border: 1px solid var(--border);
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .pill:hover {
          background: var(--gold);
          border-color: var(--gold);
          transform: translateY(-1px);
        }
        .pill:hover .pill-time,
        .pill:hover .pill-avail {
          color: var(--green-dark);
        }
        .pill-time {
          font-family: "Cormorant Garamond", serif;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--green-dark);
          line-height: 1;
        }
        .pill-avail {
          font-size: 0.6rem;
          font-weight: 500;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-body);
        }
        .pill-more {
          justify-content: center;
          font-family: "Montserrat", sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--gold);
          background: transparent;
        }
        .pill-more:hover {
          background: var(--gold);
          color: var(--green-dark);
        }
        @media (max-width: 700px) {
          .search-bar {
            position: static;
            padding: 1.25rem;
          }
          .course-card {
            padding: 1.25rem;
          }
          .course-head {
            flex-direction: column;
          }
          .toolbar {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </>
  );
}
