"use client";

import { useEffect, useState } from "react";
import SiteNav from "@/components/SiteNav";

type TeeTime = {
  course: string;
  courseUrl: string;
  date: string;
  time: string;
  price?: string;
  playersAvailable?: number;
  bookingUrl: string;
  distanceKm?: number;
};

type SearchState = "idle" | "locating" | "loading" | "done" | "error";

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

  useEffect(() => {
    const saved = localStorage.getItem("fs_coords");
    if (saved) {
      try {
        const c = JSON.parse(saved);
        setCoords(c);
        setLocationLabel(c.label ?? "Saved location");
      } catch {}
    }
  }, []);

  async function useMyLocation() {
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

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setError(null);
    setResults([]);
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
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as { results: TeeTime[] };
      setResults(data.results);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  return (
    <>
      <SiteNav />
      <main className="page">
        <section className="section">
          <div className="container">
            <div className="section-header">
              <span className="section-label">Tee Time Finder</span>
              <h1 className="section-title">Search every course in one place</h1>
              <div className="section-divider" />
              <p className="section-subtitle">
                Live availability across MiClub and Quick18 courses in Australia. Filter by date, group size, and how far you&apos;re willing to drive.
              </p>
            </div>

            <form
              onSubmit={search}
              style={{
                background: "var(--white)",
                border: "1px solid var(--border)",
                padding: "2rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1.25rem",
                alignItems: "end",
                marginBottom: "2.5rem",
              }}
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
                <label>Radius (km)</label>
                <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
                  {[10, 25, 50, 100, 250].map((n) => (
                    <option key={n} value={n}>{n} km</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Postcode (optional)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  placeholder="e.g. 6000"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={useMyLocation}
                  className="btn btn-outline"
                  style={{ padding: "0.7rem 1rem", fontSize: "0.65rem" }}
                >
                  {state === "locating" ? "Locating..." : coords ? "Update Location" : "Use My Location"}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={state === "loading"}
                  style={{ padding: "0.9rem 1rem", fontSize: "0.7rem" }}
                >
                  {state === "loading" ? "Searching..." : "Find Tee Times"}
                </button>
              </div>
            </form>

            {locationLabel && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-body)", marginBottom: "1rem" }}>
                Searching near: <strong style={{ color: "var(--green-dark)" }}>{locationLabel}</strong>
              </p>
            )}

            {error && (
              <div
                style={{
                  padding: "1rem 1.5rem",
                  border: "1px solid #c44",
                  background: "#fdecec",
                  color: "#8a2a2a",
                  marginBottom: "1.5rem",
                  fontSize: "0.85rem",
                }}
              >
                {error}
              </div>
            )}

            {state === "done" && results.length === 0 && (
              <p style={{ textAlign: "center", color: "var(--text-body)", padding: "3rem 0" }}>
                No tee times found for those filters. Try widening the radius or picking a different date.
              </p>
            )}

            {results.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="card"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 1fr auto",
                      gap: "1.5rem",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ textAlign: "center", borderRight: "1px solid var(--border)", paddingRight: "1rem" }}>
                      <div style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: "2rem",
                        fontWeight: 600,
                        color: "var(--green-dark)",
                        lineHeight: 1,
                      }}>{r.time}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--gold)", letterSpacing: "2px", textTransform: "uppercase", marginTop: "0.3rem" }}>
                        {r.playersAvailable ?? "—"} avail
                      </div>
                    </div>
                    <div>
                      <h4 style={{ fontSize: "1.2rem", fontWeight: 500, color: "var(--green-dark)", marginBottom: "0.25rem" }}>
                        {r.course}
                      </h4>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-body)" }}>
                        {r.date}
                        {r.price ? ` · ${r.price}` : ""}
                        {typeof r.distanceKm === "number" ? ` · ${r.distanceKm.toFixed(1)} km away` : ""}
                      </p>
                    </div>
                    <a
                      href={r.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ padding: "0.8rem 1.4rem", fontSize: "0.7rem" }}
                    >
                      Book
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
