"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

/**
 * Kartenansicht zum Setzen von Koordinaten (Anforderung 4.5):
 * Klick auf die Karte füllt die lat/lng-Formularfelder.
 */
export default function CoordPicker({
  latName,
  lngName,
  initialLat,
  initialLng,
  centerLat = 46.0,
  centerLng = 9.26,
}: {
  latName: string;
  lngName: string;
  initialLat?: number | null;
  initialLng?: number | null;
  centerLat?: number;
  centerLng?: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [lat, setLat] = useState<number | "">(initialLat ?? "");
  const [lng, setLng] = useState<number | "">(initialLng ?? "");
  const markerRef = useRef<import("leaflet").CircleMarker | null>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      const startLat = typeof lat === "number" ? lat : centerLat;
      const startLng = typeof lng === "number" ? lng : centerLng;
      map = L.map(mapRef.current).setView([startLat, startLng], typeof lat === "number" ? 13 : 10);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const setMarker = (la: number, ln: number) => {
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.circleMarker([la, ln], {
          radius: 8,
          fillColor: "#a4632e",
          fillOpacity: 1,
          color: "#fff",
          weight: 2,
        }).addTo(map!);
      };

      if (typeof lat === "number" && typeof lng === "number") setMarker(lat, lng);

      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        const la = Math.round(e.latlng.lat * 1e6) / 1e6;
        const ln = Math.round(e.latlng.lng * 1e6) / 1e6;
        setLat(la);
        setLng(ln);
        setMarker(la, ln);
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div ref={mapRef} className="h-64 w-full overflow-hidden rounded-lg border border-neutral-300" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          name={latName}
          value={lat}
          onChange={(e) => setLat(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Breitengrad"
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
          required
        />
        <input
          name={lngName}
          value={lng}
          onChange={(e) => setLng(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Längengrad"
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
          required
        />
      </div>
    </div>
  );
}
