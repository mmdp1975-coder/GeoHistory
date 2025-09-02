"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, Fragment } from "react";

/* ==== Icone Leaflet (fix asset) ==== */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* ==== Helpers marker divIcon ==== */
function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
function typeClass(type) {
  const t = slug(type);
  if (t.includes("war") || t.includes("battle")) return "t-war";
  if (t.includes("relig")) return "t-religion";
  if (t.includes("scien") || t.includes("tech")) return "t-science";
  if (t.includes("polit")) return "t-politics";
  if (t.includes("econom")) return "t-economy";
  if (t.includes("explor") || t.includes("voyage")) return "t-exploration";
  if (t.includes("disast") || t.includes("plague") || t.includes("earthquake")) return "t-disaster";
  if (t.includes("culture") || t.includes("art") || t.includes("music")) return "t-culture";
  return "t-default";
}
function iconFor(type) {
  return L.divIcon({
    className: "",
    html: `<div class="gh-marker ${typeClass(type)}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

/* ==== Fit dinamico ==== */
function AutoFit({ markers }) {
  const map = useMap();
  const points = useMemo(
    () => (markers || [])
      .filter(m => Number.isFinite(m.latitude) && Number.isFinite(m.longitude))
      .map(m => [m.latitude, m.longitude]),
    [markers]
  );

  useEffect(() => {
    if (!points.length) { map.setView([20, 0], 2, { animate: false }); return; }
    if (points.length === 1) { map.flyTo(points[0], Math.max(map.getZoom(), 6), { duration: 0.6 }); return; }
    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 });
  }, [points, map]);

  return null;
}

/* ==== Focus su evento selezionato ==== */
function FocusOn({ event }) {
  const map = useMap();
  useEffect(() => {
    if (!event || event.latitude == null || event.longitude == null) return;
    map.flyTo([event.latitude, event.longitude], Math.max(map.getZoom(), 6), { duration: 0.8 });
  }, [event, map]);
  return null;
}

export default function MapView({ markers = [], onSelect, focusEvent }) {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const tiles = `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${key}`;

  const safeMarkers = useMemo(
    () => (markers || []).filter(m => Number.isFinite(m.latitude) && Number.isFinite(m.longitude)),
    [markers]
  );

  return (
    <Fragment>
      <div className="mapContainer">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={2}
          worldCopyJump
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer url={tiles} attribution="&copy; MapTiler &copy; OpenStreetMap &copy; NASA" />
          <AutoFit markers={safeMarkers} />
          {focusEvent && <FocusOn event={focusEvent} />}

          {safeMarkers.map((m) => (
            <Marker
              key={m.id}
              position={[m.latitude, m.longitude]}
              icon={iconFor(m.type_event)}
              eventHandlers={{ click: () => onSelect?.(m) }}
            >
              <Popup>
                <strong>{m.event}</strong>
                <div>{m.group_event}</div>
                <div>
                  {(m.from_year ?? m.year_from ?? "")}
                  {(m.to_year ?? m.year_to) && (m.to_year ?? m.year_to) !== (m.from_year ?? m.year_from)
                    ? ` – ${m.to_year ?? m.year_to}`
                    : ""}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* CSS marker visibili */}
      <style jsx global>{`
        .mapContainer { height: 100%; width: 100%; }
        .gh-marker {
          width: 14px; height: 14px;
          border-radius: 50%;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(0,0,0,.25);
          background: #3b82f6; /* default */
        }
        .gh-marker.t-war { background: #ef4444; }
        .gh-marker.t-religion { background: #a855f7; }
        .gh-marker.t-science { background: #10b981; }
        .gh-marker.t-politics { background: #f59e0b; }
        .gh-marker.t-economy { background: #22c55e; }
        .gh-marker.t-exploration { background: #06b6d4; }
        .gh-marker.t-disaster { background: #111827; }
        .gh-marker.t-culture { background: #eab308; }
        .gh-marker.t-default { background: #3b82f6; }
      `}</style>
    </Fragment>
  );
}
