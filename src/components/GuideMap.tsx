"use client";

import { useEffect, useRef, useState } from "react";
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
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  // Signatur der Pins: ändert sie sich, werden nur die Marker neu gezeichnet –
  // die Karte selbst (und damit Zoom, Kacheln, Position) bleibt bestehen.
  const markerKey = markers.map((m) => `${m.kind}:${m.lat}:${m.lng}`).join("|");

  // Karte einmalig aufbauen.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;

      const map = L.map(ref.current).setView([center.lat, center.lng], 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Pins bei jeder Änderung neu setzen.
   *
   * Vorher lief das nur beim Mounten. Wer einen Eintrag entfernte oder per
   * „+" ergänzte, sah danach eine Karte, die nicht mehr zum Guide passte –
   * die Seite aktualisiert sich per `router.refresh()`, ohne die Komponente
   * neu zu mounten.
   */
  useEffect(() => {
    let cancelled = false;

    if (!ready) return;

    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (cancelled || !map || !layer) return;

      layer.clearLayers();
      const bounds: [number, number][] = [];
      for (const m of markers) {
        L.circleMarker([m.lat, m.lng], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: COLORS[m.kind],
          fillOpacity: 0.95,
        })
          .bindPopup(m.label)
          .addTo(layer);
        bounds.push([m.lat, m.lng]);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, ready]);

  return (
    <div
      ref={ref}
      style={{ height }}
      role="application"
      aria-label={`Karte mit ${markers.length} Orten aus eurem Reiseführer`}
      className="w-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100"
    />
  );
}
