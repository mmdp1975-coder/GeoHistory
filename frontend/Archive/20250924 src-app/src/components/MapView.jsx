// src/components/MapView.jsx
"use client";

import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { memo, useEffect, useMemo, useState } from "react";

/* ===== Icone per type_event (emoji) ===== */
function symbolForType(type, group) {
  const key = String(type || group || "").toLowerCase();
  if (!key) return "📍";
  if (key.includes("war") || key.includes("battle")) return "⚔️";
  if (key.includes("treaty") || key.includes("accord") || key.includes("declaration")) return "📜";
  if (key.includes("discover") || key.includes("science") || key.includes("invention")) return "🔬";
  if (key.includes("relig")) return "✝️";
  if (key.includes("culture") || key.includes("art") || key.includes("literature")) return "🎭";
  if (key.includes("politic") || key.includes("empire") || key.includes("kingdom") || key.includes("dynasty")) return "👑";
  if (key.includes("revolt") || key.includes("uprising") || key.includes("revolution")) return "🔥";
  return "📍";
}

/* ===== Icona leaflet da emoji ===== */
function makeIcon(emoji, active) {
  const html = `<div class="gh-pin ${active ? "gh-pin--active" : ""}">${emoji}</div>`;
  return L.divIcon({
    html,
    className: "gh-pin-wrap",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
    tooltipAnchor: [0, -16],
  });
}

/* ===== Fit controller ===== */
function FitController({ markers, signal, fitPadding }) {
  const map = useMap();
  useEffect(() => {
    const pts = (markers || [])
      .map(ev => {
        const lat = Number(ev.latitude ?? ev.lat ?? ev.y);
        const lon = Number(ev.longitude ?? ev.lng ?? ev.x);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return L.latLng(lat, lon);
      })
      .filter(Boolean);
    if (!pts.length) return;
    const bounds = L.latLngBounds(pts);
    const pad = fitPadding || { top: 12, right: 12, bottom: 12, left: 12 };
    map.stop();
    map.fitBounds(bounds, {
      paddingTopLeft: L.point(pad.left, pad.top),
      paddingBottomRight: L.point(pad.right, pad.bottom),
      animate: true,
    });
  }, [markers, signal, fitPadding, map]);
  return null;
}

/* ===== Layer markers ===== */
const MarkersLayer = memo(function MarkersLayer({ markers, selectedId, onSelect }) {
  const items = useMemo(() => {
    return (markers || [])
      .map(ev => {
        const lat = Number(ev.latitude ?? ev.lat ?? ev.y);
        const lon = Number(ev.longitude ?? ev.lng ?? ev.x);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const sym = symbolForType(ev.type_event ?? ev.event_type ?? ev.type, ev.group_event ?? ev.group);
        const active = selectedId != null && (ev.id === selectedId);
        const icon = makeIcon(sym, active);
        return { ev, lat, lon, icon, active };
      })
      .filter(Boolean);
  }, [markers, selectedId]);

  return (
    <>
      {items.map(({ ev, lat, lon, icon }) => (
        <Marker
          key={ev.id ?? `${lat},${lon},${ev.event ?? ev.title ?? ""}`}
          position={[lat, lon]}
          icon={icon}
          eventHandlers={{ click: () => onSelect?.(ev) }}
        >
          <Tooltip direction="top">
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>
              {ev.event || ev.title || ev.group_event || "Event"}
            </div>
            <div style={{ fontSize: 11, opacity: .9 }}>
              {(ev.location || ev.country || ev.continent) ? `${ev.location || ""} ${ev.country || ""}`.trim() : ""}
            </div>
            {(ev.year_from || ev.year_to) && (
              <div style={{ fontSize: 11, opacity: .8, marginTop: 2 }}>
                {ev.year_from ?? ""}{(ev.year_from || ev.year_to) ? "–" : ""}{ev.year_to ?? ""}
              </div>
            )}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
});

export default function MapView({
  markers = [],
  fitSignal = 0,          // segnale di fit
  resetSignal = 0,        // alias supportato
  fitPadding,
  selectedId = null,
  onSelect,
  center = [20, 0],
  zoom = 3.5,
  defaultBase = "sat",    // "sat" | "streets"
}) {
  // Base layer (persiste in localStorage)
  const [base, setBase] = useState(() => {
    if (typeof window === "undefined") return defaultBase === "streets" ? "streets" : "sat";
    const saved = window.localStorage.getItem("gh-base");
    return (saved === "streets" || saved === "sat") ? saved : (defaultBase === "streets" ? "streets" : "sat");
  });
  useEffect(() => {
    try { window.localStorage.setItem("gh-base", base); } catch {}
  }, [base]);

  // segnale unico per FitController (copre fitSignal e resetSignal)
  const signal = (fitSignal << 1) ^ resetSignal;

  return (
    <div style={{ height: "100%", position: "relative" }}>
      {/* Toggle base layer */}
      <div
        style={{
          position: "absolute",
          zIndex: 500,
          top: 12,
          right: 12,
          background: "#fff",
          borderRadius: 999,
          padding: "4px 6px",
          border: "1px solid rgba(0,0,0,.08)",
          boxShadow: "0 6px 18px rgba(17,24,39,.12)",
          display: "flex",
          gap: 4,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <button
          onClick={() => setBase("sat")}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: base === "sat" ? "#111827" : "#fff",
            color: base === "sat" ? "#fff" : "#111827",
            cursor: "pointer",
          }}
        >
          Satellite
        </button>
        <button
          onClick={() => setBase("streets")}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: base === "streets" ? "#111827" : "#fff",
            color: base === "streets" ? "#fff" : "#111827",
            cursor: "pointer",
          }}
        >
          Streets
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={2}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
        worldCopyJump={true}
        preferCanvas={true}
      >
        {/* Base layers */}
        {base === "sat" ? (
          <TileLayer
            url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles &copy; Esri — World Imagery'
            zIndex={200}
          />
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
            zIndex={200}
          />
        )}

        {/* Labels/reference overlay */}
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution='Labels &copy; Esri — Reference Layer'
          zIndex={650}
        />

        <MarkersLayer markers={markers} selectedId={selectedId} onSelect={onSelect} />
        <FitController markers={markers} signal={signal} fitPadding={fitPadding} />
      </MapContainer>

      {/* marker styles */}
      <style jsx global>{`
        .gh-pin-wrap { }
        .gh-pin {
          font-size: 18px;
          line-height: 1;
          transform: translate(-2px, -6px);
          filter: drop-shadow(0 2px 8px rgba(0,0,0,.25));
        }
        .gh-pin--active { transform: translate(-2px, -6px) scale(1.2); }
      `}</style>
    </div>
  );
}
