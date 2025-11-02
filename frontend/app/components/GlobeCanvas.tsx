'use client';

import * as React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useTexture } from '@react-three/drei';

// ====== Types ======
export type PointInfo = {
  lat: number;
  lon: number;
  continent?: string;
  country?: string;
  city?: string;
  radiusKm?: number;
};

type Props = {
  height?: number;          // px height of the canvas area
  radius?: number;          // sphere radius (Scene units)
  onPointSelect?: (info: PointInfo) => void;
  onContinentSelect?: (code: string) => void; // not used in this version but preserved for compatibility
  initialRadiusKm?: number; // default city radius shown in the UI badge
};

// ====== Small helpers ======
function toRad(d: number) { return (d * Math.PI) / 180; }
function toDeg(r: number) { return (r * 180) / Math.PI; }

function latLonToVector3(lat: number, lon: number, R: number) {
  // lat,lon in degrees; three.js sphere is Y-up; we map:
  // phi = 90 - lat; theta = lon + 180
  const phi = toRad(90 - lat);
  const theta = toRad(lon + 180);
  const x = -R * Math.sin(phi) * Math.cos(theta);
  const z =  R * Math.sin(phi) * Math.sin(theta);
  const y =  R * Math.cos(phi);
  return { x, y, z };
}

function vector3ToLatLon(x: number, y: number, z: number) {
  const R = Math.sqrt(x*x + y*y + z*z) || 1;
  const lat = 90 - toDeg(Math.acos(y / R));
  const lon = -toDeg(Math.atan2(x, z));
  return { lat, lon: ((lon + 540) % 360) - 180 }; // normalize lon to [-180,180]
}

function haversineKm(a: {lat:number, lon:number}, b: {lat:number, lon:number}) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s1 = Math.sin(dLat/2) ** 2 +
             Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon/2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s1)));
}

// Point in polygon (lon,lat arrays); polygon is [ [lon,lat], ... ]
function isPointInRing(point: [number, number], ring: [number, number][]) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) &&
                      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeoJSON(lon: number, lat: number, feature: any): boolean {
  // Supports Polygon / MultiPolygon
  const coords = feature.geometry?.coordinates;
  const type = feature.geometry?.type;
  if (!coords || !type) return false;

  const pt: [number, number] = [lon, lat];

  if (type === 'Polygon') {
    // first ring is outer; holes later
    return coords.some((ring: [number, number][]) => isPointInRing(pt, ring));
  }
  if (type === 'MultiPolygon') {
    return coords.some((poly: [number, number][][]) =>
      poly.some((ring: [number, number][]) => isPointInRing(pt, ring))
    );
  }
  return false;
}

// ====== Data loader hook ======
type GeoFeature = {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: { type: string; coordinates: any };
};
type GeoJSON = { type: 'FeatureCollection'; features: GeoFeature[] };

function useGeoData() {
  const [continents, setContinents] = React.useState<GeoFeature[] | null>(null);
  const [countries, setCountries] = React.useState<GeoFeature[] | null>(null);
  const [cities, setCities] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c1, c2, c3] = await Promise.all([
          fetch('/data/continents.geojson').then(r => r.ok ? r.json() : null),
          fetch('/data/countries.geojson').then(r => r.ok ? r.json() : null),
          fetch('/data/cities.geojson').then(r => r.ok ? r.json() : null),
        ]);

        if (cancelled) return;
        if (c1?.features) setContinents(c1.features as GeoFeature[]);
        if (c2?.features) setCountries(c2.features as GeoFeature[]);
        if (c3?.features || Array.isArray(c3)) setCities((c3.features ?? c3) as any[]);
      } catch {
        // soft-fail; nulls remain
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { continents, countries, cities };
}

// ====== Scene component (inside Canvas) ======
function GlobeScene({
  radius,
  initialRadiusKm,
  onPointSelect,
}: {
  radius: number;
  initialRadiusKm: number;
  onPointSelect?: (info: PointInfo) => void;
}) {
  const { camera, gl, scene } = useThree();

  // Texture (satellite) from public path
  const texture = useTexture('/bg/world-satellite.jpg');

  const { continents, countries, cities } = useGeoData();

  // Start centered over Europe (approx: 48N, 12E)
  React.useEffect(() => {
    const target = latLonToVector3(48, 12, radius);
    const camDist = radius * 3.2;
    const dirLen = Math.sqrt(target.x ** 2 + target.y ** 2 + target.z ** 2) || 1;
    camera.position.set(
      (target.x / dirLen) * camDist,
      (target.y / dirLen) * camDist,
      (target.z / dirLen) * camDist
    );
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    gl.setSize(gl.domElement.clientWidth, gl.domElement.clientHeight, false);
  }, [camera, gl, radius]);

  // Click handler: project ray to sphere, compute lat/lon, then lookup continent/country/nearest city
  const meshRef = React.useRef<any>(null);
  const [info, setInfo] = React.useState<PointInfo | null>(null);
  const [radiusKm, setRadiusKm] = React.useState<number>(initialRadiusKm);

  const onPointerDown = (e: any) => {
    // Intersect point on the sphere
    if (!meshRef.current) return;
    const ip = e.intersections?.[0]?.point ?? e.point;
    if (!ip) return;

    const { lat, lon } = vector3ToLatLon(ip.x, ip.y, ip.z);

    // Lookups (sync)
    let continentName: string | undefined;
    let countryName: string | undefined;
    let nearestCity: string | undefined;

    try {
      if (continents) {
        for (const f of continents) {
          const props = f.properties || {};
          if (pointInGeoJSON(lon, lat, f)) {
            continentName = props.continent || props.CONTINENT || props.name || props.NAME || undefined;
            break;
          }
        }
      }
      if (countries) {
        for (const f of countries) {
          const props = f.properties || {};
          if (pointInGeoJSON(lon, lat, f)) {
            countryName = props.name || props.NAME || props.admin || props.ADMIN || props.sovereignt || props.SOVEREIGNT || undefined;
            break;
          }
        }
      }
      if (cities && Array.isArray(cities)) {
        let best: { name: string; d: number } | null = null;
        for (const c of cities) {
          const p = c.properties ?? c; // allow both FC and plain array
          const clat = p.latitude ?? p.LATITUDE ?? p.lat ?? p.LATitude ?? p.lat;
          const clon = p.longitude ?? p.LONGITUDE ?? p.lon ?? p.LONgitude ?? p.lon;
          if (typeof clat !== 'number' || typeof clon !== 'number') continue;
          const d = haversineKm({ lat, lon }, { lat: clat, lon: clon });
          if (!best || d < best.d) best = { name: p.name || p.NAME || p.nameascii || p.NAMEASCII || 'Unknown', d };
        }
        nearestCity = best?.name;
      }
    } catch {
      // ignore
    }

    const next: PointInfo = {
      lat,
      lon,
      radiusKm,
      continent: continentName,
      country: countryName,
      city: nearestCity,
    };
    setInfo(next);
    onPointSelect?.(next);
  };

  // UI Badge (below globe) – smaller text as requested
  const Badge = () => (
    <Html position={[0, -radius * 1.3, 0]} transform={false} center={false}>
      <div className="mt-2 w-full">
        <div className="mx-auto w-fit rounded-md border border-neutral-200 bg-white/90 px-2 py-1 text-[11px] text-neutral-700 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {info ? (
              <>
                <span><b>Lat</b> {info.lat.toFixed(3)}</span>
                <span><b>Lon</b> {info.lon.toFixed(3)}</span>
                {typeof info.radiusKm === 'number' && <span><b>City radius</b> {info.radiusKm} km</span>}
                {info.continent && <span><b>Continent</b> {info.continent}</span>}
                {info.country && <span><b>Country</b> {info.country}</span>}
                {info.city && <span><b>Nearest city</b> {info.city}</span>}
              </>
            ) : (
              <span>Pick a point on the globe…</span>
            )}
          </div>
        </div>

        {/* Radius slider (compact) */}
        <div className="mx-auto mt-1 w-fit rounded-md border border-neutral-200 bg-white/90 px-2 py-1 text-[11px] text-neutral-700 shadow-sm">
          <label className="mr-2">City radius (km)</label>
          <input
            type="range"
            min={10}
            max={1000}
            step={10}
            value={radiusKm}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRadiusKm(v);
              if (info) {
                const next = { ...info, radiusKm: v };
                setInfo(next);
                onPointSelect?.(next);
              }
            }}
          />
          <span className="ml-2 tabular-nums">{radiusKm}</span>
        </div>
      </div>
    </Html>
  );

  // Subtle auto-rotation (very slow)
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.02;
  });

  return (
    <>
      <mesh ref={meshRef} onPointerDown={onPointerDown}>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshStandardMaterial map={texture} roughness={1} metalness={0} />
      </mesh>

      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 2, 2]} intensity={0.9} />

      <OrbitControls
        enablePan={false}
        rotateSpeed={0.6}
        zoomSpeed={0.6}
        minDistance={radius * 2.2}
        maxDistance={radius * 5.0}
      />

      <Badge />
    </>
  );
}

// ====== Wrapper exporting a ready Canvas ======
export default function GlobeCanvas({
  height = 300,
  radius = 1.8,
  onPointSelect,
  onContinentSelect, // reserved
  initialRadiusKm = 50,
}: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <Canvas
        camera={{ fov: 32, near: 0.1, far: 1000 }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }}
      >
        <GlobeScene
          radius={radius}
          initialRadiusKm={initialRadiusKm}
          onPointSelect={onPointSelect}
        />
      </Canvas>
    </div>
  );
}
