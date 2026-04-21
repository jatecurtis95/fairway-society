"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import SiteNav from "@/components/SiteNav";
import CoursesMap from "@/components/CoursesMap";
import "./tee-times.css";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  suburb?: string;
  state?: string;
  imageUrl?: string;
  gameType: string;
  layout: string;
  price?: number;
};

type PrivateCourse = {
  course: string;
  courseUrl: string;
  distanceKm?: number;
  lat?: number;
  lng?: number;
  suburb?: string;
  state?: string;
  imageUrl?: string;
};

type SearchState = "idle" | "locating" | "loading" | "done" | "error";
type Daypart = "all" | "morning" | "midday" | "afternoon" | "twilight";
type HolesFilter = "all" | "9" | "18";
type SortKey = "nearest" | "earliest" | "most";

type CourseGroup = {
  course: string;
  distanceKm?: number;
  lat?: number;
  lng?: number;
  suburb?: string;
  state?: string;
  imageUrl?: string;
  times: TeeTime[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYPARTS: { key: Daypart; label: string; icon: string; range: string }[] = [
  { key: "all",       label: "Any time",  icon: "⊙", range: "All day" },
  { key: "morning",   label: "Morning",   icon: "🌅", range: "Before 12pm" },
  { key: "midday",    label: "Midday",    icon: "☀️", range: "12–3pm" },
  { key: "afternoon", label: "Afternoon", icon: "🌤", range: "3–6pm" },
  { key: "twilight",  label: "Twilight",  icon: "🌙", range: "After 6pm" },
];

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
  if (dp === "morning")   return h < 12;
  if (dp === "midday")    return h >= 12 && h < 15;
  if (dp === "afternoon") return h >= 15 && h < 18;
  if (dp === "twilight")  return h >= 18;
  return true;
}

function isHolesMatch(gameType: string, layout: string, f: HolesFilter): boolean {
  if (f === "all") return true;
  const blob = `${gameType} ${layout}`.toLowerCase();
  if (f === "9")  return /\b9\s*hole/.test(blob);
  if (f === "18") return /\b18\s*hole/.test(blob) || !/\b9\s*hole/.test(blob);
  return true;
}

function groupHolesLabel(times: TeeTime[]): string {
  let has9 = false, has18 = false;
  for (const t of times) {
    const blob = `${t.gameType} ${t.layout}`.toLowerCase();
    if (/\b9\s*hole/.test(blob))  has9 = true;
    if (/\b18\s*hole/.test(blob)) has18 = true;
    if (has9 && has18) break;
  }
  if (has9 && has18) return "9 & 18 holes";
  if (has18) return "18 holes";
  if (has9)  return "9 holes";
  return "Mixed";
}

function groupMinPrice(times: TeeTime[]): number | null {
  const prices = times.map((t) => t.price).filter((p): p is number => p !== undefined);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function groupByCourse(results: TeeTime[]): CourseGroup[] {
  const map = new Map<string, CourseGroup>();
  for (const r of results) {
    let g = map.get(r.course);
    if (!g) {
      g = { course: r.course, distanceKm: r.distanceKm, lat: r.lat, lng: r.lng,
            suburb: r.suburb, state: r.state, imageUrl: r.imageUrl, times: [] };
      map.set(r.course, g);
    }
    g.times.push(r);
  }
  return [...map.values()];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeeTimesPage() {
  const [state, setState] = useState<SearchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TeeTime[]>([]);
  const [privateCourses, setPrivateCourses] = useState<PrivateCourse[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [locationDenied, setLocationDenied] = useState(false);
  const hasAutoSearched = useRef(false);

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [players, setPlayers] = useState(2);
  const [radiusKm, setRadiusKm] = useState(50);
  const [postcode, setPostcode] = useState("");
  const [courseQuery, setCourseQuery] = useState("");

  const [daypart, setDaypart] = useState<Daypart>("all");
  const [holes, setHoles] = useState<HolesFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("nearest");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const courseRefs = useRef<Record<string, HTMLElement | null>>({});

  // ── Map pin selection ──────────────────────────────────────────────────────
  const handleSelectPin = useCallback((key: string) => {
    setActiveCourse(key);
    setViewMode("list");
    const el = courseRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setActiveCourse((k) => (k === key ? null : k)), 2500);
  }, []);

  // ── Core search function ───────────────────────────────────────────────────
  const doSearch = useCallback(async (
    searchCoords: { lat: number; lng: number } | null,
    searchDate: string,
    searchPlayers: number,
    searchRadius: number,
    searchPostcode: string,
    searchCourseQuery: string = "",
    searchRandom: boolean = false,
  ) => {
    setState("loading");
    setError(null);
    setResults([]);
    setPrivateCourses([]);
    setExpanded({});
    try {
      const body = {
        date: searchDate,
        players: searchPlayers,
        radiusKm: searchRadius,
        lat: searchCoords?.lat,
        lng: searchCoords?.lng,
        postcode: searchPostcode || undefined,
        courseQuery: searchCourseQuery.trim() || undefined,
        random: searchRandom || undefined,
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
      const data = (await res.json()) as { results: TeeTime[]; privateCourses?: PrivateCourse[] };
      setResults(data.results);
      setPrivateCourses(data.privateCourses ?? []);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }, []);

  // ── Auto-locate + auto-search on mount ────────────────────────────────────
  useEffect(() => {
    // First try cached coords
    const saved = localStorage.getItem("fs_coords");
    if (saved) {
      try {
        const c = JSON.parse(saved) as { lat: number; lng: number; label?: string };
        setCoords({ lat: c.lat, lng: c.lng });
        setLocationLabel(c.label ?? "Saved location");
        if (!hasAutoSearched.current) {
          hasAutoSearched.current = true;
          doSearch({ lat: c.lat, lng: c.lng }, today, 2, 50, "");
        }
        return;
      } catch {}
    }

    // Otherwise ask browser for location
    if (!navigator.geolocation) return;
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setLocationLabel("Current location");
        localStorage.setItem("fs_coords", JSON.stringify({ ...c, label: "Current location" }));
        setState("idle");
        if (!hasAutoSearched.current) {
          hasAutoSearched.current = true;
          doSearch(c, today, 2, 50, "");
        }
      },
      () => {
        setState("idle");
        setLocationDenied(true);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Manual search (form submit) ────────────────────────────────────────────
  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    doSearch(coords, date, players, radiusKm, postcode, courseQuery);
  }

  // ── Re-search when date or players change (after first search) ─────────────
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!hasAutoSearched.current) return;
    if (state === "loading") return;
    const timer = setTimeout(() => {
      doSearch(coords, date, players, radiusKm, postcode, courseQuery);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, players]);

  // ── Use my location button ─────────────────────────────────────────────────
  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    setState("locating");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setLocationLabel("Current location");
        setPostcode("");
        setLocationDenied(false);
        localStorage.setItem("fs_coords", JSON.stringify({ ...c, label: "Current location" }));
        setState("idle");
        doSearch(c, date, players, radiusKm, postcode, courseQuery);
      },
      (err) => {
        setState("error");
        setError(err.message || "Unable to get your location. Try entering a postcode instead.");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  // ── Filtered + sorted groups ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    return results.filter(
      (r) => inDaypart(r.time, daypart) && isHolesMatch(r.gameType, r.layout, holes)
    );
  }, [results, daypart, holes]);

  const groups = useMemo(() => {
    const g = groupByCourse(filtered);
    g.forEach((c) =>
      c.times.sort((a, b) => (parseHour(a.time) ?? 99) - (parseHour(b.time) ?? 99))
    );
    if (sortKey === "nearest")  g.sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
    if (sortKey === "earliest") g.sort((a, b) => (parseHour(a.times[0]?.time ?? "") ?? 99) - (parseHour(b.times[0]?.time ?? "") ?? 99));
    if (sortKey === "most")     g.sort((a, b) => b.times.length - a.times.length);
    return g;
  }, [filtered, sortKey]);

  const totalSlots = filtered.length;
  const totalCourses = groups.length + privateCourses.length;
  const isSearching = state === "loading" || state === "locating";

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <SiteNav />
      <main className="page">

        {/* ── Hero + Search ── */}
        <section className="hero-section">
          <div className="container">
            <div className="hero-text">
              <span className="section-label">Tee Time Finder</span>
              <h1 className="hero-title">Every course.<br />One search.</h1>
              <p className="hero-sub">
                Live availability across MiClub courses in Australia — sorted by distance.
              </p>
            </div>

            {/* Search card */}
            <form onSubmit={handleSearch} className="search-card">
              <div className="search-row">

                {/* Date */}
                <div className="search-field">
                  <label className="field-label">Date</label>
                  <input
                    type="date"
                    value={date}
                    min={today}
                    className="field-input"
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="field-sep" />

                {/* Players */}
                <div className="search-field search-field-sm">
                  <label className="field-label">Players</label>
                  <select
                    value={players}
                    className="field-input"
                    onChange={(e) => setPlayers(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n} player{n > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>

                <div className="field-sep" />

                {/* Radius */}
                <div className="search-field search-field-sm">
                  <label className="field-label">Radius</label>
                  <select
                    value={radiusKm}
                    className="field-input"
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                  >
                    {[10, 25, 50, 100, 250].map((n) => (
                      <option key={n} value={n}>{n} km</option>
                    ))}
                  </select>
                </div>

                <div className="field-sep" />

                {/* Location */}
                <div className="search-field search-field-location">
                  <label className="field-label">Location</label>
                  {coords ? (
                    <div className="location-set">
                      <span className="location-dot" />
                      <span className="location-name">{locationLabel}</span>
                      <button type="button" className="location-change" onClick={useMyLocation}>
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="location-unset">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        placeholder="Postcode"
                        value={postcode}
                        className="field-input postcode-input"
                        onChange={(e) => setPostcode(e.target.value)}
                      />
                      <button type="button" className="gps-btn" onClick={useMyLocation} title="Use my location">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                          <path d="M12 2a10 10 0 1 0 10 10"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                <div className="field-sep" />

                {/* Course name */}
                <div className="search-field">
                  <label className="field-label">Course name</label>
                  <input
                    type="text"
                    placeholder="e.g. Joondalup"
                    value={courseQuery}
                    className="field-input"
                    onChange={(e) => setCourseQuery(e.target.value)}
                  />
                </div>

                {/* Search button */}
                <button
                  type="submit"
                  className="search-btn"
                  disabled={isSearching || (!coords && !postcode && !courseQuery.trim())}
                >
                  {isSearching ? (
                    <span className="btn-spinner" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                  )}
                  <span>{isSearching ? (state === "locating" ? "Locating…" : "Searching…") : "Search"}</span>
                </button>

                {/* Surprise me button */}
                <button
                  type="button"
                  className="surprise-btn"
                  disabled={isSearching}
                  title={`Pick a random course with availability for ${players} player${players > 1 ? "s" : ""}`}
                  onClick={() => doSearch(coords, date, players, radiusKm, postcode, "", true)}
                >
                  <span aria-hidden>🎲</span>
                  <span>Surprise me</span>
                </button>
              </div>

              {/* Location denied hint */}
              {locationDenied && (
                <p className="location-denied-hint">
                  📍 Location access was denied — enter a postcode above or{" "}
                  <button type="button" className="inline-link" onClick={useMyLocation}>
                    try again
                  </button>
                  .
                </p>
              )}
            </form>

            {error && (
              <div className="error-banner" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}
          </div>
        </section>

        {/* ── Loading skeleton ── */}
        {state === "loading" && (
          <section className="results-section">
            <div className="container">
              <div className="loading-state">
                <div className="loading-ring" />
                <p className="loading-text">Searching courses near you…</p>
                <p className="loading-sub">Checking live availability across all MiClub courses</p>
              </div>
            </div>
          </section>
        )}

        {/* ── Empty state ── */}
        {state === "done" && results.length === 0 && privateCourses.length === 0 && (
          <section className="results-section">
            <div className="container">
              <div className="empty-state">
                <div className="empty-icon">⛳</div>
                <h3 className="empty-title">No tee times found</h3>
                <p className="empty-body">
                  Try widening your search radius, choosing a different date, or reducing the number of players.
                </p>
                <div className="empty-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setRadiusKm((r) => Math.min(r * 2, 250))}
                  >
                    Widen radius to {Math.min(radiusKm * 2, 250)} km
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Results ── */}
        {state === "done" && (results.length > 0 || privateCourses.length > 0) && (
          <section className="results-section">
            <div className="container">

              {/* Stats bar */}
              <div className="stats-bar">
                <div className="stats-left">
                  <div className="stat">
                    <span className="stat-value">{totalCourses}</span>
                    <span className="stat-label">Course{totalCourses !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat">
                    <span className="stat-value">{totalSlots}</span>
                    <span className="stat-label">Tee time{totalSlots !== 1 ? "s" : ""}</span>
                  </div>
                  {coords && (
                    <>
                      <div className="stat-divider" />
                      <div className="stat">
                        <span className="stat-value">{radiusKm} km</span>
                        <span className="stat-label">Radius</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="stats-right">
                  <div className="view-toggle">
                    <button
                      type="button"
                      className={`view-btn ${viewMode === "list" ? "view-btn-active" : ""}`}
                      onClick={() => setViewMode("list")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                        <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                        <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                      </svg>
                      List
                    </button>
                    <button
                      type="button"
                      className={`view-btn ${viewMode === "map" ? "view-btn-active" : ""}`}
                      onClick={() => setViewMode("map")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                        <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
                      </svg>
                      Map
                    </button>
                  </div>
                </div>
              </div>

              {/* Filter + Sort bar */}
              <div className="filter-bar">
                <div className="filter-left">
                  {/* Mobile: toggle button */}
                  <button
                    type="button"
                    className="filter-toggle-btn"
                    onClick={() => setShowFilters((v) => !v)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/>
                      <line x1="10" y1="18" x2="14" y2="18"/>
                    </svg>
                    Filters
                    {(daypart !== "all" || holes !== "all") && <span className="filter-dot" />}
                  </button>

                  {/* Desktop: inline chips */}
                  <div className={`filter-chips ${showFilters ? "filter-chips-open" : ""}`}>
                    <div className="chip-group">
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
                    </div>
                    <div className="chip-sep" />
                    <div className="chip-group">
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
                  </div>
                </div>

                <div className="sort-row">
                  <span className="sort-label">Sort</span>
                  {([
                    ["nearest",  "Nearest"],
                    ["earliest", "Earliest"],
                    ["most",     "Most avail"],
                  ] as [SortKey, string][]).map(([k, label]) => (
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

              {/* No results after filter */}
              {groups.length === 0 && (
                <div className="empty-state empty-state-sm">
                  <p>No tee times match those filters.</p>
                  <button
                    type="button"
                    className="inline-link"
                    onClick={() => { setDaypart("all"); setHoles("all"); }}
                  >
                    Clear filters
                  </button>
                </div>
              )}

              {/* Map view */}
              {viewMode === "map" && (groups.some((g) => g.lat && g.lng) || privateCourses.some((p) => p.lat && p.lng)) && (
                <div className="map-wrap">
                  <CoursesMap
                    pins={[
                      ...groups
                        .filter((g) => typeof g.lat === "number" && typeof g.lng === "number")
                        .map((g) => ({
                          key: slugify(g.course),
                          name: g.course,
                          lat: g.lat!,
                          lng: g.lng!,
                          slotCount: g.times.length,
                          isActive: activeCourse === slugify(g.course),
                        })),
                      ...privateCourses
                        .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
                        .map((p) => ({
                          key: slugify(p.course),
                          name: p.course,
                          lat: p.lat!,
                          lng: p.lng!,
                          slotCount: 0,
                          isActive: activeCourse === slugify(p.course),
                        })),
                    ]}
                    center={coords}
                    activeKey={activeCourse}
                    onSelect={handleSelectPin}
                  />
                  <p className="map-hint">Tap a pin to jump to that course below</p>
                </div>
              )}

              {/* Course cards */}
              {groups.length > 0 && (
                <div className="course-grid">
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
                        {/* Photo */}
                        {g.imageUrl ? (
                          <div className="course-photo-wrap">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={g.imageUrl}
                              alt={`${g.course} golf course`}
                              className="course-photo"
                              loading="lazy"
                            />
                            <div className="course-photo-overlay" />
                            <span className="course-photo-badge">{groupHolesLabel(g.times)}</span>
                            {typeof g.distanceKm === "number" && (
                              <span className="course-photo-dist">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                </svg>
                                {formatDistance(g.distanceKm)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="course-photo-placeholder">
                            <span>⛳</span>
                          </div>
                        )}

                        {/* Body */}
                        <div className="course-body">
                          <header className="course-head">
                            <div>
                              <h3 className="course-name">{g.course}</h3>
                              <p className="course-meta">
                                {[
                                  g.suburb && g.state ? `${g.suburb}, ${g.state}` : g.state,
                                  !g.imageUrl && typeof g.distanceKm === "number"
                                    ? formatDistance(g.distanceKm) + " away"
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                            <div className="course-head-right">
                              <span className="slot-badge">
                                {g.times.length}
                                <span className="slot-badge-label"> slot{g.times.length !== 1 ? "s" : ""}</span>
                              </span>
                              {(() => {
                                const mp = groupMinPrice(g.times);
                                return mp !== null ? (
                                  <span className="price-badge">
                                    from <span className="price-value">${mp}</span>
                                  </span>
                                ) : null;
                              })()}
                              {!g.imageUrl && (
                                <span className="holes-badge">{groupHolesLabel(g.times)}</span>
                              )}
                            </div>
                          </header>

                          {/* Tee time pills */}
                          <div className="pill-row">
                            {visible.map((t, i) => (
                              <a
                                key={i}
                                href={t.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pill"
                                title={`${t.playersAvailable} spots · ${t.layout}`}
                              >
                                <span className="pill-time">{t.time}</span>
                                <span className="pill-avail">
                                  {t.price !== undefined ? `$${t.price}` : `${t.playersAvailable} avail`}
                                </span>
                              </a>
                            ))}
                            {hidden > 0 && (
                              <button
                                type="button"
                                className="pill pill-more"
                                onClick={() => setExpanded((e) => ({ ...e, [g.course]: true }))}
                              >
                                +{hidden} more
                              </button>
                            )}
                          </div>

                          {/* Book CTA */}
                          <a
                            href={g.times[0]?.courseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="book-btn"
                          >
                            Book at {g.course}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {/* Private / no-availability courses */}
              {privateCourses.length > 0 && (
                <>
                  <div className="private-divider">
                    <span className="private-divider-line" />
                    <span className="private-divider-label">No Online Tee Times Today</span>
                    <span className="private-divider-line" />
                  </div>
                  <div className="course-grid">
                    {privateCourses.map((pc) => {
                      const key = slugify(pc.course);
                      return (
                        <article key={pc.course} className="course-card course-card-private">
                          {pc.imageUrl ? (
                            <div className="course-photo-wrap">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={pc.imageUrl}
                                alt={`${pc.course} golf course`}
                                className="course-photo"
                                loading="lazy"
                              />
                              <div className="course-photo-overlay course-photo-overlay-private" />
                              <span className="course-photo-badge course-photo-badge-private">No Times</span>
                              {typeof pc.distanceKm === "number" && (
                                <span className="course-photo-dist">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                  </svg>
                                  {formatDistance(pc.distanceKm)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="course-photo-placeholder course-photo-placeholder-private">
                              <span>🔒</span>
                            </div>
                          )}
                          <div className="course-body">
                            <header className="course-head">
                              <div>
                                <h3 className="course-name">{pc.course}</h3>
                                <p className="course-meta">
                                  {[
                                    pc.suburb && pc.state ? `${pc.suburb}, ${pc.state}` : pc.state,
                                    !pc.imageUrl && typeof pc.distanceKm === "number"
                                      ? formatDistance(pc.distanceKm) + " away"
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </div>
                              <span className="private-badge">No Availability</span>
                            </header>
                            <p className="private-note">
                              No online tee times available for this date. Try another day or contact the club directly.
                            </p>
                            <a
                              href={pc.courseUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="book-btn book-btn-private"
                            >
                              Visit club website
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                              </svg>
                            </a>
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

        {/* ── Idle state (no search yet, location denied) ── */}
        {state === "idle" && !hasAutoSearched.current && locationDenied && (
          <section className="results-section">
            <div className="container">
              <div className="empty-state">
                <div className="empty-icon">📍</div>
                <h3 className="empty-title">Where are you playing?</h3>
                <p className="empty-body">
                  Enter a postcode above or allow location access to find tee times near you.
                </p>
              </div>
            </div>
          </section>
        )}

      </main>
    </>
  );
}
