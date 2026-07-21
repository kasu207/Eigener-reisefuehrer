"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  kind: "place" | "restaurant" | "hike" | "spot";
}

const COLORS: Record<MapMarker["kind"], string> = {
  place: "#a4632e",
  restaurant: "#33566b",
  hike: "#4a7c3f",
  spot: "#8a3fa0",
};

/**
 * Übersichtskarte (Leaflet + OpenStreetMap, Anforderung 4.4).
 * CircleMarker statt Icon-Marker, um Bundler-Probleme mit Leaflet-Assets zu vermeiden.
 */
export default function GuideMap({
  center,
  markers,
  height = 420,
}: {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      map = L.map(ref.current).setView([center.lat, center.lng], 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map);

      const bounds: [number, number][] = [];
      for (const m of markers) {
        L.circleMarker([m.lat, m.lng], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: COLORS[m.kind],
          fillOpacity: 0.95,
        })
          .addTo(map)
          .bindPopup(m.label);
        bounds.push([m.lat, m.lng]);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      style={{ height }}
      className="w-full overflow-hidden rounded-2xl border border-neutral-200"
    />
  );
}
