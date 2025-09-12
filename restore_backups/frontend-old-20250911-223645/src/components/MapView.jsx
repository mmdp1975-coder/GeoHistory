"use client";

import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { memo, useEffect, useMemo, useRef } from "react";

/* ===== Icone per type_event (emoji) ===== */
function symbolForType(type) {
  const key = String(type || "").toLowerCase();
  if (key.includes("war") || key.includes("battle")) return "⚔️";
  if (key.includes("treaty") || key.includes("accord")) return "📜";
  if (key.includes("discover") || key.includes("scien")) return "🔬";
  if (key.includes("relig")) return "✝️";
  if (key.includes("culture") || key.includes("art")) return "🎭";
  if (key.includes("politic") || key.includes("empire") || key.includes("kingdom")) return "👑";
  if (key.includes("revolt") || key.includes("uprising")) return "🔥";
  if (key.includes("colon") || key.includes("migrat")) return "🧭";
  if (key.includes("catast") || key.includes("plague") || key.includes("earthquake")) return "💀";
  if (key.includes("econom") || key.includes("trade")) return "💰";
  return "•";
}
function makeIcon(symbol, active = false) {
  return L.divIcon({
    className: active ? "gh-marker active" : "gh-marker",
    html: `<span class="gh-emoji">${symbol}</span>`,
    iconSize: active ? [48, 48] : [36, 36],
    iconAnchor: active ? [24, 24] : [18, 18],
    tooltipAnchor: [0, -18],
  });
}

/* ===== FocusController: centra con offset pixel-to-latlng ===== */
function FocusController({ focusEvent, panOffsetPx }) {
  const map = useMap();
  const last = useRef({ id: null, x: 0, y: 0 });

  const centerWithOffset = (latlng, offset) => {
    const z = Math.max(map.getZoom(), 5);
    const pt = map.latLngToContainerPoint(latlng, z);
    const targetPt = L.point(pt.x - (offset?.x || 0), pt.y + (offset?.y || 0));
    const target = map.containerPointToLatLng(targetPt, z);
    map.stop();
    map.flyTo(target, z, { animate: true, duration: 0.75 });
  };

  useEffect(() => {
    if (!focusEvent || !Number.isFinite(focusEvent.latitude) || !Number.isFinite(focusEvent.longitude)) return;
    const latlng = L.latLng(focusEvent.latitude, focusEvent.longitude);
    last.current = { id: focusEvent.id, x: panOffsetPx?.x || 0, y: panOffsetPx?.y || 0 };
    centerWithOffset(latlng, panOffsetPx);
  }, [focusEvent]); // eslint-disable-line

  // Se cambia l’offset per lo stesso evento (es. apre/chiude sheet o resize), ricentra
  useEffect(() => {
    if (!focusEvent || last.current.id !== focusEvent.id) return;
    const latlng = L.latLng(focusEvent.latitude, focusEvent.longitude);
    if (last.current.x === (panOffsetPx?.x || 0) && last.current.y === (panOffsetPx?.y || 0)) return;
    last.current = { id: focusEvent.id, x: panOffsetPx?.x || 0, y: panOffsetPx?.y || 0 };
    centerWithOffset(latlng, panOffsetPx);
  }, [panOffsetPx?.x, panOffsetPx?.y]); // eslint-disable-line

  return null;
}

/* ===== FitController: inquadra tutti i marker quando cambia fitSignal ===== */
function FitController({ markers, fitSignal, fitPadding }) {
  const map = useMap();
  const lastSignal = useRef(0);

  useEffect(() => {
    if (!markers || !markers.length) return;
    if (fitSignal === lastSignal.current) return;
    lastSignal.current = fitSignal;

    const latlngs = markers
      .filter(ev => Number.isFinite(ev.latitude) && Number.isFinite(ev.longitude))
      .map(ev => [ev.latitude, ev.longitude]);

    if (!latlngs.length) return;

    const bounds = L.latLngBounds(latlngs);
    const pad = fitPadding || { top: 12, right: 12, bottom: 12, left: 12 };
    map.stop();
    map.fitBounds(bounds, {
      paddingTopLeft: L.point(pad.left, pad.top),
      paddingBottomRight: L.point(pad.right, pad.bottom),
      animate: true,
    });
  }, [markers, fitSignal, fitPadding, map]);

  return null;
}

/* ===== Markers layer con evidenziazione del selezionato ===== */
const MarkersLayer = memo(function MarkersLayer({ markers, selectedId, onSelect }) {
  const items = useMemo(() => (markers || []).map((ev) => {
    const lat = Number(ev.latitude), lon = Number(ev.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const sym = symbolForType(ev.type_event ?? ev.event_type ?? ev.type ?? null);
    const active = (selectedId != null) && (ev.id === selectedId);
    const icon = makeIcon(sym, active);
    return { ev, lat, lon, icon, active };
  }).filter(Boolean), [markers, selectedId]);

  return (
    <>
      {items.map(({ ev, lat, lon, icon, active }) => (
        <Marker
          key={ev.id ?? `${lat},${lon},${ev.event}`}
          position={[lat, lon]}
          icon={icon}
          zIndexOffset={active ? 1000 : 0}
          eventHandlers={{ click: () => onSelect?.(ev) }}
        >
          {(ev.event || ev.group_event) && (
            <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
              <div style={{ maxWidth: 240 }}>
                <strong>{ev.event || "Event"}</strong>
                {ev.group_event ? <div style={{ opacity: .8 }}>{ev.group_event}</div> : null}
              </div>
            </Tooltip>
          )}
        </Marker>
      ))}
    </>
  );
});

/* ===== Scala icone con zoom ===== */
function ScaleController() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const setScale = () => {
      const z = map.getZoom();
      const s = Math.min(1.8, Math.max(0.85, 0.95 + 0.12 * (z - 3)));
      el.style.setProperty("--mk-scale", String(s));
    };
    setScale();
    map.on("zoomend", setScale);
    return () => map.off("zoomend", setScale);
  }, [map]);
  return null;
}

export default function MapView({
  markers = [],
  selectedId = null,
  onSelect,
  focusEvent = null,
  panOffsetPx = { x: 0, y: 0 },
  fitSignal = 0,
  fitPadding = { top: 12, right: 12, bottom: 12, left: 12 },
}) {
  const center = [20, 0];

  return (
    <MapContainer
      center={center}
      zoom={2}
      minZoom={2}
      worldCopyJump
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      {/* Satellite + Labels (ESRI) */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        zIndex={200}
      />
      <TileLayer
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        attribution='Labels &copy; Esri — Reference Layer'
        zIndex={650}
      />

      <MarkersLayer markers={markers} selectedId={selectedId} onSelect={onSelect} />
      <FocusController focusEvent={focusEvent} panOffsetPx={panOffsetPx} />
      <FitController markers={markers} fitSignal={fitSignal} fitPadding={fitPadding} />
      <ScaleController />
    </MapContainer>
  );
}


