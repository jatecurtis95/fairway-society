"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import SiteNav from "@/components/SiteNav";
import CoursesMap from "@/components/CoursesMap";

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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [locationDenied, setLocationDenied] = useState(false);
  const hasAutoSearched = useRef(false);

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
  ) => {
    setState("loading");
    setError(null);
    setResults([]);
    setExpanded({});
    try {
      const body = {
        date: searchDate,
        players: searchPlayers,
        radiusKm: searchRadius,
        lat: searchCoords?.lat,
        lng: searchCoords?.lng,
        postcode: searchPostcode || undefined,
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
    doSearch(coords, date, players, radiusKm, postcode);
  }

  // ── Re-search when date or players change (after first search) ─────────────
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!hasAutoSearched.current) return;
    if (state === "loading") return;
    const timer = setTimeout(() => {
      doSearch(coords, date, players, radiusKm, postcode);
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
        doSearch(c, date, players, radiusKm, postcode);
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

                {/* Search button */}
                <button
                  type="submit"
                  className="search-btn"
                  disabled={isSearching || (!coords && !postcode)}
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
        {state === "done" && results.length === 0 && (
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
        {state === "done" && results.length > 0 && (
          <section className="results-section">
            <div className="container">

              {/* Stats bar */}
              <div className="stats-bar">
                <div className="stats-left">
                  <div className="stat">
                    <span className="stat-value">{groups.length}</span>
                    <span className="stat-label">Course{groups.length !== 1 ? "s" : ""}</span>
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
              {viewMode === "map" && groups.some((g) => g.lat && g.lng) && (
                <div className="map-wrap">
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
                                <span className="pill-avail">{t.playersAvailable} avail</span>
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

      <style jsx>{`
        /* ── Layout ─────────────────────────────────────────────────────────── */
        .hero-section {
          padding: 4rem 0 2rem;
          background: var(--cream-light, #f5f2eb);
        }
        .hero-text { text-align: center; margin-bottom: 2.5rem; }
        .hero-title {
          font-family: "Cormorant Garamond", serif;
          font-size: clamp(2.2rem, 5vw, 3.5rem);
          font-weight: 500;
          color: var(--green-dark);
          line-height: 1.15;
          margin: 0.5rem 0 1rem;
        }
        .hero-sub {
          font-size: 0.95rem;
          color: var(--text-body);
          max-width: 480px;
          margin: 0 auto;
          line-height: 1.7;
        }
        .results-section { padding: 2rem 0 4rem; }

        /* ── Search card ─────────────────────────────────────────────────────── */
        .search-card {
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 4px;
          box-shadow: 0 8px 40px rgba(27, 58, 45, 0.08);
          padding: 0;
          overflow: hidden;
          position: sticky;
          top: 4.5rem;
          z-index: 50;
        }
        .search-row {
          display: flex;
          align-items: stretch;
          flex-wrap: wrap;
        }
        .search-field {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 1rem 1.25rem;
          flex: 1;
          min-width: 130px;
        }
        .search-field-sm  { flex: 0 0 auto; min-width: 110px; }
        .search-field-location { flex: 1.5; min-width: 180px; }
        .field-sep {
          width: 1px;
          background: var(--border);
          margin: 0.75rem 0;
          flex-shrink: 0;
        }
        .field-label {
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--text-body);
          margin-bottom: 0.35rem;
          display: block;
        }
        .field-input {
          border: none;
          outline: none;
          background: transparent;
          font-family: "Montserrat", sans-serif;
          font-size: 0.9rem;
          color: var(--green-dark);
          font-weight: 500;
          width: 100%;
          cursor: pointer;
          padding: 0;
          appearance: none;
          -webkit-appearance: none;
        }
        .field-input:focus { outline: none; }

        /* Location field */
        .location-set {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .location-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #22c55e;
          flex-shrink: 0;
        }
        .location-name {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--green-dark);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .location-change {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--gold);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .location-change:hover { text-decoration: underline; }
        .location-unset { display: flex; align-items: center; gap: 0.5rem; }
        .postcode-input { max-width: 100px; }
        .gps-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 50%;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--green-dark);
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .gps-btn:hover { border-color: var(--gold); color: var(--gold); }

        /* Search button */
        .search-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: var(--green-dark);
          color: var(--cream);
          border: none;
          padding: 0 2rem;
          font-family: "Montserrat", sans-serif;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s;
          min-height: 64px;
          min-width: 120px;
          flex-shrink: 0;
        }
        .search-btn:hover:not(:disabled) { background: var(--green-mid, #2d5a3d); }
        .search-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: var(--cream);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Hints */
        .location-denied-hint {
          padding: 0.75rem 1.25rem;
          background: #fffbeb;
          border-top: 1px solid #fde68a;
          font-size: 0.8rem;
          color: #92400e;
        }
        .inline-link {
          background: none;
          border: none;
          color: var(--gold);
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
          font-size: inherit;
        }
        .error-banner {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-top: 0.75rem;
          padding: 0.9rem 1.25rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          font-size: 0.85rem;
          border-radius: 2px;
        }

        /* ── Loading ─────────────────────────────────────────────────────────── */
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 5rem 0;
          text-align: center;
        }
        .loading-ring {
          width: 44px;
          height: 44px;
          border: 3px solid var(--border);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .loading-text {
          font-size: 1rem;
          color: var(--green-dark);
          font-weight: 500;
        }
        .loading-sub {
          font-size: 0.8rem;
          color: var(--text-body);
          margin-top: -0.5rem;
        }

        /* ── Empty state ─────────────────────────────────────────────────────── */
        .empty-state {
          text-align: center;
          padding: 5rem 1rem;
        }
        .empty-state-sm { padding: 2rem 1rem; }
        .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
        .empty-title {
          font-family: "Cormorant Garamond", serif;
          font-size: 1.8rem;
          color: var(--green-dark);
          margin-bottom: 0.75rem;
        }
        .empty-body {
          font-size: 0.9rem;
          color: var(--text-body);
          max-width: 380px;
          margin: 0 auto 1.5rem;
          line-height: 1.7;
        }
        .empty-actions { display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; }
        .btn { padding: 0.75rem 1.5rem; font-family: "Montserrat", sans-serif; font-size: 0.75rem; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; border: 1px solid var(--green-dark); color: var(--green-dark); background: transparent; transition: all 0.2s; }
        .btn-outline:hover { background: var(--green-dark); color: var(--cream); }

        /* ── Stats bar ───────────────────────────────────────────────────────── */
        .stats-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          border-bottom: 1px solid var(--border);
          margin-bottom: 1rem;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .stats-left { display: flex; align-items: center; gap: 1rem; }
        .stat { display: flex; align-items: baseline; gap: 0.35rem; }
        .stat-value {
          font-family: "Cormorant Garamond", serif;
          font-size: 1.4rem;
          font-weight: 600;
          color: var(--green-dark);
          line-height: 1;
        }
        .stat-label {
          font-size: 0.7rem;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-body);
        }
        .stat-divider { width: 1px; height: 24px; background: var(--border); }
        .stats-right { display: flex; align-items: center; gap: 1rem; }

        /* View toggle */
        .view-toggle { display: flex; border: 1px solid var(--border); border-radius: 3px; overflow: hidden; }
        .view-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 1rem;
          background: transparent;
          border: none;
          font-family: "Montserrat", sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-body);
          cursor: pointer;
          transition: all 0.2s;
        }
        .view-btn:hover { color: var(--green-dark); }
        .view-btn-active { background: var(--green-dark); color: var(--cream); }

        /* ── Filter bar ──────────────────────────────────────────────────────── */
        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }
        .filter-left { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
        .filter-toggle-btn {
          display: none;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.9rem;
          border: 1px solid var(--border);
          background: transparent;
          font-family: "Montserrat", sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-body);
          cursor: pointer;
          position: relative;
          border-radius: 3px;
        }
        .filter-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--gold);
          position: absolute;
          top: 4px;
          right: 4px;
        }
        .filter-chips {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .chip-group { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .chip-sep { width: 1px; height: 20px; background: var(--border); margin: 0 0.25rem; }
        .chip {
          padding: 0.45rem 0.85rem;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-body);
          font-family: "Montserrat", sans-serif;
          font-size: 0.65rem;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 2px;
          white-space: nowrap;
        }
        .chip:hover { border-color: var(--gold); color: var(--gold); }
        .chip-active { background: var(--green-dark); color: var(--cream); border-color: var(--green-dark); }
        .chip-active:hover { background: var(--green-mid, #2d5a3d); }

        /* Sort */
        .sort-row { display: flex; align-items: center; gap: 0.25rem; }
        .sort-label {
          font-size: 0.65rem;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--text-body);
          margin-right: 0.5rem;
          white-space: nowrap;
        }
        .sort-btn {
          padding: 0.4rem 0.75rem;
          background: transparent;
          border: none;
          color: var(--text-body);
          font-family: "Montserrat", sans-serif;
          font-size: 0.7rem;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .sort-btn:hover { color: var(--green-dark); }
        .sort-btn-active { color: var(--green-dark); border-bottom-color: var(--gold); font-weight: 600; }

        /* ── Map ─────────────────────────────────────────────────────────────── */
        .map-wrap { margin-bottom: 1rem; }
        .map-hint {
          font-size: 0.75rem;
          color: var(--text-body);
          text-align: center;
          margin-top: 0.5rem;
          letter-spacing: 0.5px;
        }

        /* ── Course grid ─────────────────────────────────────────────────────── */
        .course-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 1.5rem;
        }

        /* ── Course card ─────────────────────────────────────────────────────── */
        .course-card {
          background: var(--white);
          border: 1px solid var(--border);
          overflow: hidden;
          transition: all 0.3s ease;
          border-radius: 3px;
          display: flex;
          flex-direction: column;
        }
        .course-card:hover {
          border-color: var(--gold);
          box-shadow: 0 12px 48px rgba(184, 150, 78, 0.15);
          transform: translateY(-3px);
        }
        .course-card-active {
          border-color: var(--gold) !important;
          box-shadow: 0 8px 30px rgba(184, 150, 78, 0.25) !important;
        }

        /* Photo */
        .course-photo-wrap {
          position: relative;
          width: 100%;
          height: 200px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .course-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          transition: transform 0.6s ease;
        }
        .course-card:hover .course-photo { transform: scale(1.04); }
        .course-photo-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, transparent 35%, rgba(27,58,45,0.65) 100%);
        }
        .course-photo-badge {
          position: absolute;
          bottom: 0.85rem;
          right: 0.85rem;
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--gold);
          border: 1px solid var(--gold);
          padding: 0.3rem 0.65rem;
          background: rgba(27,58,45,0.75);
          backdrop-filter: blur(4px);
          border-radius: 2px;
        }
        .course-photo-dist {
          position: absolute;
          bottom: 0.85rem;
          left: 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 1px;
          color: var(--cream);
          background: rgba(27,58,45,0.7);
          backdrop-filter: blur(4px);
          padding: 0.3rem 0.6rem;
          border-radius: 2px;
        }
        .course-photo-placeholder {
          width: 100%;
          height: 120px;
          background: linear-gradient(135deg, var(--green-dark) 0%, #2d5a3d 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          flex-shrink: 0;
        }

        /* Card body */
        .course-body { padding: 1.25rem 1.5rem 1.5rem; flex: 1; display: flex; flex-direction: column; }
        .course-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding-bottom: 0.875rem;
          border-bottom: 1px solid rgba(184,150,78,0.15);
        }
        .course-name {
          font-family: "Cormorant Garamond", serif;
          font-size: 1.4rem;
          font-weight: 500;
          color: var(--green-dark);
          line-height: 1.2;
          margin-bottom: 0.3rem;
        }
        .course-meta {
          font-size: 0.7rem;
          color: var(--text-body);
          letter-spacing: 0.75px;
          text-transform: uppercase;
        }
        .course-head-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem; flex-shrink: 0; }
        .slot-badge {
          font-family: "Cormorant Garamond", serif;
          font-size: 1.3rem;
          font-weight: 600;
          color: #16a34a;
          line-height: 1;
          white-space: nowrap;
        }
        .slot-badge-label {
          font-family: "Montserrat", sans-serif;
          font-size: 0.6rem;
          font-weight: 500;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-body);
        }
        .holes-badge {
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--gold);
          border: 1px solid var(--gold);
          padding: 0.25rem 0.6rem;
          white-space: nowrap;
          border-radius: 2px;
        }

        /* Pills */
        .pill-row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem; flex: 1; }
        .pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.1rem;
          padding: 0.5rem 0.75rem;
          min-width: 68px;
          background: var(--cream-light, #f5f2eb);
          border: 1px solid var(--border);
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 2px;
        }
        .pill:hover {
          background: var(--gold);
          border-color: var(--gold);
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(184,150,78,0.25);
        }
        .pill:hover .pill-time,
        .pill:hover .pill-avail { color: var(--green-dark); }
        .pill-time {
          font-family: "Cormorant Garamond", serif;
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--green-dark);
          line-height: 1;
        }
        .pill-avail {
          font-size: 0.58rem;
          font-weight: 500;
          letter-spacing: 0.75px;
          text-transform: uppercase;
          color: var(--text-body);
        }
        .pill-more {
          justify-content: center;
          font-family: "Montserrat", sans-serif;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--gold);
          background: transparent;
          border-style: dashed;
        }
        .pill-more:hover { background: var(--gold); color: var(--green-dark); border-style: solid; }

        /* Book CTA */
        .book-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: var(--green-dark);
          color: var(--cream);
          text-decoration: none;
          font-family: "Montserrat", sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          transition: all 0.2s;
          border-radius: 2px;
          align-self: flex-start;
          margin-top: auto;
        }
        .book-btn:hover {
          background: var(--gold);
          color: var(--green-dark);
          transform: translateX(2px);
        }

        /* ── Mobile responsive ───────────────────────────────────────────────── */
        @media (max-width: 768px) {
          .hero-section { padding: 2rem 0 1.5rem; }
          .hero-title { font-size: 2rem; }

          .search-card { position: static; border-radius: 0; border-left: none; border-right: none; }
          .search-row { flex-direction: column; }
          .field-sep { display: none; }
          .search-field { padding: 0.875rem 1rem; border-bottom: 1px solid var(--border); }
          .search-field:last-of-type { border-bottom: none; }
          .search-field-sm { min-width: unset; }
          .search-field-location { min-width: unset; }
          .search-btn {
            width: 100%;
            min-height: 52px;
            border-radius: 0;
            padding: 1rem;
          }

          .stats-bar { padding: 0.75rem 0; }
          .stat-value { font-size: 1.2rem; }

          .filter-toggle-btn { display: flex; }
          .filter-chips { display: none; }
          .filter-chips-open { display: flex; width: 100%; }
          .chip-sep { display: none; }

          .sort-row { flex-wrap: wrap; }

          .course-grid { grid-template-columns: 1fr; gap: 1rem; }
          .course-photo-wrap { height: 180px; }
          .course-body { padding: 1rem 1.25rem 1.25rem; }
          .course-name { font-size: 1.25rem; }

          .empty-state { padding: 3rem 1rem; }
        }

        @media (max-width: 480px) {
          .stats-left { gap: 0.75rem; }
          .pill { min-width: 60px; padding: 0.45rem 0.6rem; }
          .pill-time { font-size: 0.95rem; }
          .book-btn { width: 100%; justify-content: center; }
        }
      `}</style>
    </>
  );
}
