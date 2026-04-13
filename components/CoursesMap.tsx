"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Pin = {
  key: string;
  name: string;
  lat: number;
  lng: number;
  slotCount: number;
  isActive: boolean;
};

type Props = {
  pins: Pin[];
  center?: { lat: number; lng: number } | null;
  activeKey: string | null;
  onSelect: (key: string) => void;
};

export default function CoursesMap({ pins, center, activeKey, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.warn("NEXT_PUBLIC_MAPBOX_TOKEN not set — map disabled.");
      return;
    }
    mapboxgl.accessToken = token;

    const initialCenter: [number, number] = center
      ? [center.lng, center.lat]
      : pins.length
      ? [pins[0].lng, pins[0].lat]
      : [134.0, -27.0]; // center of Australia

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: initialCenter,
      zoom: 9,
      attributionControl: true,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers whenever pins change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove stale markers.
    const incoming = new Set(pins.map((p) => p.key));
    markersRef.current.forEach((marker, key) => {
      if (!incoming.has(key)) {
        marker.remove();
        markersRef.current.delete(key);
      }
    });

    // Add / update markers.
    pins.forEach((p) => {
      let marker = markersRef.current.get(p.key);
      if (!marker) {
        const el = document.createElement("button");
        el.className = "fs-pin";
        el.type = "button";
        el.addEventListener("click", () => onSelect(p.key));
        marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
              `<strong>${p.name}</strong><br/><span style="font-size:11px;color:#4A5D52;letter-spacing:1px;text-transform:uppercase;">${p.slotCount} tee time${p.slotCount === 1 ? "" : "s"}</span>`
            )
          )
          .addTo(map);
        markersRef.current.set(p.key, marker);
      } else {
        marker.setLngLat([p.lng, p.lat]);
      }
      const el = marker.getElement();
      el.dataset.active = p.isActive ? "1" : "0";
      el.innerHTML = `<span class="fs-pin-dot"></span><span class="fs-pin-count">${p.slotCount}</span>`;
    });

    // Fit bounds to visible pins.
    if (pins.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      pins.forEach((p) => bounds.extend([p.lng, p.lat]));
      if (center) bounds.extend([center.lng, center.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 600 });
    }
  }, [pins, center, onSelect]);

  // Pop up popup for the active pin.
  useEffect(() => {
    if (!activeKey) return;
    const marker = markersRef.current.get(activeKey);
    if (!marker) return;
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: marker.getLngLat(), zoom: Math.max(map.getZoom(), 11), duration: 500 });
    marker.togglePopup();
    const timeout = setTimeout(() => {
      const popup = marker.getPopup();
      if (popup?.isOpen()) popup.remove();
    }, 2500);
    return () => clearTimeout(timeout);
  }, [activeKey]);

  return (
    <>
      <div ref={containerRef} className="fs-map" />
      <style jsx global>{`
        .fs-map {
          width: 100%;
          height: 480px;
          border: 1px solid var(--border);
          margin-bottom: 1.5rem;
        }
        .fs-pin {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.6rem 0.3rem 0.4rem;
          background: var(--green-dark);
          color: var(--cream);
          border: 2px solid var(--gold);
          border-radius: 999px;
          font-family: "Montserrat", sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 1px;
          cursor: pointer;
          box-shadow: 0 3px 10px rgba(27, 58, 45, 0.25);
          transition: transform 0.15s ease;
        }
        .fs-pin:hover {
          transform: translateY(-2px);
        }
        .fs-pin[data-active="1"] {
          background: var(--gold);
          color: var(--green-dark);
          border-color: var(--green-dark);
          transform: scale(1.08);
        }
        .fs-pin-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--gold);
          display: inline-block;
        }
        .fs-pin[data-active="1"] .fs-pin-dot {
          background: var(--green-dark);
        }
        .fs-pin-count {
          line-height: 1;
        }
        .mapboxgl-popup-content {
          font-family: "Montserrat", sans-serif;
          font-size: 0.8rem;
          color: var(--green-dark);
          border-radius: 0 !important;
          padding: 0.7rem 1rem !important;
        }
        .mapboxgl-popup-tip {
          display: none !important;
        }
      `}</style>
    </>
  );
}
