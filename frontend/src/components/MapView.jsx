"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

// Fix icone Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// DivIcon per type_event
function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
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

function FitToMarkers({ markers }) {
  const map = useMap();
  useEffect(() => {
    if (!markers?.length) return;
    const bounds = L.latLngBounds(markers.map(m => [m.latitude, m.longitude]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
  }, [markers, map]);
  return null;
}

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

  return (
    <div className="mapContainer">
      <MapContainer center={[20, 0]} zoom={2} worldCopyJump scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer url={tiles} attribution="&copy; MapTiler &copy; OpenStreetMap &copy; NASA" />
        {markers?.length > 0 && <FitToMarkers markers={markers} />}
        {focusEvent && <FocusOn event={focusEvent} />}
        {markers?.map((m) => (
          <Marker
            key={m.id}
            position={[m.latitude, m.longitude]}
            icon={iconFor(m.type_event)}
            eventHandlers={{ click: () => onSelect?.(m) }}
          >
            <Popup>
              <strong>{m.event}</strong>
              <div>{m.group_event}</div>
              <div>{(m.from_year ?? "")}{m.to_year && m.to_year !== m.from_year ? ` – ${m.to_year}` : ""}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
