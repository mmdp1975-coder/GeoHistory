"use client";
import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, useTexture } from "@react-three/drei";

/* ============================== Helpers ============================== */

function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function canonicalLon(lon: number) {
  // riporta qualsiasi valore in [-180, +180]
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

function vector3ToLatLon(v: THREE.Vector3) {
  const vn = v.clone().normalize();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(vn.y));
  const rawLon = THREE.MathUtils.radToDeg(Math.atan2(vn.z, -vn.x)) - 180;
  const lon = canonicalLon(rawLon);
  return { lat, lon };
}

function normalizeLon(lon: number) {
  let L = lon;
  while (L > 180) L -= 360;
  while (L < -180) L += 360;
  return L;
}

type GeoFeature = {
  type: string;
  properties: Record<string, any>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any };
};

type CitiesEntry = {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  pop_max?: number;
  scalerank?: number;
};

/* ---------- robust PIP: esterno + fori + multipoligoni ---------- */

function isPointInRing([x, y]: [number, number], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInPolygonRings(pt: [number, number], rings: number[][][]) {
  if (!rings || !rings.length) return false;
  const inOuter = isPointInRing(pt, rings[0]);
  if (!inOuter) return false;
  for (let i = 1; i < rings.length; i++) {
    if (isPointInRing(pt, rings[i])) return false;
  }
  return true;
}

function pointInGeoRaw(pt: [number, number], geom: GeoFeature["geometry"]) {
  if (!geom) return false;
  if (geom.type === "Polygon") {
    return isPointInPolygonRings(pt, geom.coordinates);
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly: number[][][]) =>
      isPointInPolygonRings(pt, poly)
    );
  }
  return false;
}

// antimeridiano-safe
function pointInGeoAM(pt: [number, number], geom: GeoFeature["geometry"]) {
  const [lon, lat] = pt;
  const tests: [number, number][] = [
    [normalizeLon(lon), lat],
    [normalizeLon(lon + 360), lat],
    [normalizeLon(lon - 360), lat],
  ];
  return tests.some((p) => pointInGeoRaw(p, geom));
}

/* ================ Thinning semplice dei marker città ================ */
/**
 * Obiettivo: mostrare MENO puntini ma mantenere il dataset completo
 * per il riconoscimento della città più vicina.
 *
 * Regole:
 * 1) Keep sempre capitali e grandi città:
 *    - scalerank <= 3  (capitali / maggiori)
 *    - pop_max >= 1.000.000
 * 2) Per le altre, teniamo 1 città per cella di griglia 5°x5°
 *    (distribuzione uniforme e meno “rumore”).
 */
function thinCities(cities: CitiesEntry[]): CitiesEntry[] {
  const keep: CitiesEntry[] = [];
  const taken = new Set<string>();

  for (const c of cities) {
    const sr = c.scalerank ?? 10;
    const pop = c.pop_max ?? 0;

    const isMajor = sr <= 3 || pop >= 1_000_000;
    if (isMajor) {
      keep.push(c);
      continue;
    }

    // Griglia 5°
    const latCell = Math.floor((c.latitude + 90) / 5);
    const lonCell = Math.floor((normalizeLon(c.longitude) + 180) / 5);
    const key = `${latCell}:${lonCell}`;

    if (!taken.has(key)) {
      taken.add(key);
      keep.push(c);
    }
  }
  return keep;
}

/* ============================== Scene bits ============================== */

function useEuropeStart(radius: number) {
  const { camera, gl } = useThree();
  React.useEffect(() => {
    gl.toneMappingExposure = 1.3;
    const targetLat = 47;
    const targetLon = 10;
    const camDist = radius * 3.0;

    const look = new THREE.Vector3(0, 0, 0);
    const pos = latLonToVector3(targetLat, targetLon, radius)
      .normalize()
      .multiplyScalar(camDist);

    camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }, [camera, gl, radius]);
}

function CityDots({ radius, cities }: { radius: number; cities: CitiesEntry[] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const [hoverPos, setHoverPos] = React.useState<THREE.Vector3 | null>(null);

  const positions = React.useMemo(
    () => cities.map((c) => latLonToVector3(c.latitude, c.longitude, radius + 0.003)),
    [cities, radius]
  );

  // DOT più piccoli (da 0.006 -> 0.004)
  const geom = React.useMemo(() => new THREE.SphereGeometry(0.002, 12, 12), []);
  const mat = React.useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#ffd166", toneMapped: false }),
    []
  );

  const { camera, gl } = useThree();
  const raycaster = React.useMemo(() => new THREE.Raycaster(), []);
  const pointer = React.useRef(new THREE.Vector2());

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer.current, camera);

    let minIdx = -1;
    let minDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const d = raycaster.ray.distanceToPoint(positions[i]);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    if (minIdx >= 0 && minDist < 0.15) {
      setHover(minIdx);
      setHoverPos(positions[minIdx]);
    } else {
      setHover(null);
      setHoverPos(null);
    }
  };

  return (
    <group onPointerMove={onPointerMove}>
      {positions.map((p, i) => (
        <mesh key={i} position={p} geometry={geom} material={mat} />
      ))}
      {hover != null && hoverPos && (
        <Html
          position={hoverPos.clone().normalize().multiplyScalar(radius + 0.05)}
          center
          style={{
            background: "rgba(20,20,20,0.85)",
            color: "white",
            padding: "6px 8px",
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {cities[hover].name} — {cities[hover].country}
        </Html>
      )}
    </group>
  );
}

function GlobeMesh({
  radius,
  onPick,
}: {
  radius: number;
  onPick: (lat: number, lon: number) => void;
}) {
  const colorMap = useTexture("/bg/world-satellite.jpg") as THREE.Texture;

  React.useEffect(() => {
    colorMap.colorSpace = THREE.SRGBColorSpace;
    colorMap.generateMipmaps = true;
    colorMap.minFilter = THREE.LinearMipmapLinearFilter;
    colorMap.magFilter = THREE.LinearFilter;
    colorMap.anisotropy = 16;
    colorMap.needsUpdate = true;
  }, [colorMap]);

  const ref = React.useRef<THREE.Mesh>(null);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!ref.current) return;
    const p = e.point as THREE.Vector3;
    const { lat, lon } = vector3ToLatLon(p);
    onPick(lat, lon);
  };

  return (
    <mesh ref={ref} onPointerDown={handlePointerDown}>
      <sphereGeometry args={[radius, 128, 128]} />
      <meshStandardMaterial map={colorMap} roughness={0.85} metalness={0.0} envMapIntensity={0.0} />
    </mesh>
  );
}

/* ============================== Main Component ============================== */

export default function GlobeCanvas({
  onPointSelect,
  initialRadiusKm,
  height,
  radius: globeRadius,
}: {
  onPointSelect?: (info: {
    lat: number;
    lon: number;
    continent?: string;
    country?: string;
    city?: string;
    radiusKm: number;
  }) => void;
  initialRadiusKm?: number;
  height?: number;
  radius?: number;
}) {
  const radius = typeof globeRadius === "number" ? globeRadius : 1.0;

  const [picked, setPicked] = React.useState<{ lat: number; lon: number } | null>(null);
  const [continent, setContinent] = React.useState<string>("");
  const [country, setCountry] = React.useState<string>("");
  const [nearestCity, setNearestCity] = React.useState<string>("");

  const [continentsData, setContinentsData] = React.useState<GeoFeature[]>([]);
  const [countriesData, setCountriesData] = React.useState<GeoFeature[]>([]);
  const [citiesData, setCitiesData] = React.useState<CitiesEntry[]>([]);
  const dataReady = continentsData.length > 0 && countriesData.length > 0;

  React.useEffect(() => {
    async function loadAll() {
      const [cont, coun, city] = await Promise.all([
        fetch("/data/continents.geojson").then((r) => r.json()).catch(() => null),
        fetch("/data/countries.geojson").then((r) => r.json()).catch(() => null),
        fetch("/data/cities.geojson").then((r) => r.json()).catch(() => null),
      ]);

      if (cont?.features) setContinentsData(cont.features);
      if (coun?.features) setCountriesData(coun.features);

      const cityFeatures: any[] = city?.features || [];
      const rows: CitiesEntry[] = cityFeatures.map((f: any) => {
        const [lon, lat] = Array.isArray(f.geometry?.coordinates)
          ? f.geometry.coordinates
          : [0, 0];
        return {
          name:
            f.properties?.name ??
            f.properties?.NAME ??
            f.properties?.NAMEASCII ??
            "",
          country:
            f.properties?.country ??
            f.properties?.adm0name ??
            f.properties?.ADMIN ??
            "",
          latitude: f.properties?.latitude ?? lat,
          longitude: f.properties?.longitude ?? lon,
          pop_max: f.properties?.pop_max ?? f.properties?.POP_MAX,
          scalerank: f.properties?.scalerank ?? f.properties?.SCALERANK,
        };
      });
      setCitiesData(rows);
    }
    loadAll();
  }, []);

  const updateAttributesFor = React.useCallback(
    (lat: number, lon: number) => {
      setPicked({ lat, lon: canonicalLon(lon) });

      if (!dataReady) {
        setContinent("-");
        setCountry("-");
        setNearestCity("-");
        return;
      }

      const pt: [number, number] = [normalizeLon(lon), lat];

      // continent
      let contName = "";
      for (const f of continentsData) {
        if (pointInGeoAM(pt, f.geometry)) {
          contName =
            f.properties?.CONTINENT ||
            f.properties?.continent ||
            f.properties?.name ||
            "";
          break;
        }
      }
      setContinent(contName || "Unknown");

      // country
      let countryName = "";
      for (const f of countriesData) {
        if (pointInGeoAM(pt, f.geometry)) {
          countryName =
            f.properties?.ADMIN ||
            f.properties?.NAME_EN ||
            f.properties?.NAME ||
            f.properties?.name ||
            "";
          break;
        }
      }
      setCountry(countryName || "Unknown");

      // nearest city — usa TUTTE le città (non quelle "diradate")
      if (citiesData.length) {
        let bestIdx = -1;
        let minD = Infinity;
        const toRad = Math.PI / 180;
        const R = 6371;
        const lat1 = lat * toRad;
        const lon1 = normalizeLon(lon) * toRad;
        for (let i = 0; i < citiesData.length; i++) {
          const c = citiesData[i];
          const lat2 = c.latitude * toRad;
          let dlon = normalizeLon(c.longitude) * toRad - lon1;
          if (dlon > Math.PI) dlon -= 2 * Math.PI;
          if (dlon < -Math.PI) dlon += 2 * Math.PI;

          const dlat = lat2 - lat1;
          const a =
            Math.sin(dlat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
          const d = 2 * R * Math.asin(Math.sqrt(a));
          if (d < minD) {
            minD = d;
            bestIdx = i;
          }
        }
        setNearestCity(bestIdx >= 0 ? citiesData[bestIdx].name : "Unknown");
      } else {
        setNearestCity("Unknown");
      }
    },
    [dataReady, continentsData, countriesData, citiesData]
  );

  const [radiusKm, setRadiusKm] = React.useState(initialRadiusKm ?? 250);

  // Notifica la landing quando cambia la selezione o il raggio
  React.useEffect(() => {
    if (!onPointSelect || !picked) return;
    onPointSelect({
      lat: picked.lat,
      lon: picked.lon,
      continent,
      country,
      city: nearestCity,
      radiusKm,
    });
  }, [onPointSelect, picked, continent, country, nearestCity, radiusKm]);

  // Calcola le città da visualizzare (diradate), ma NON tocca il dataset completo
  const renderCities = React.useMemo(() => thinCities(citiesData), [citiesData]);

  return (
    <div className="w-full">
      {/* canvas (globo più piccolo) */}
      <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white/60 backdrop-blur">
        <Canvas
          style={{ width: "100%", height: 420 }} // ridotto da 520 -> 420
          dpr={[1, 2]}
          camera={{ fov: 35, near: 0.1, far: 1000 }}
          gl={{ antialias: true }}
        >
          <ambientLight intensity={0.95} />
          <directionalLight position={[5, 3, 5]} intensity={1.2} />
          <directionalLight position={[-5, -2, -5]} intensity={0.6} />

          <Scene
            radius={1.0}
            onPick={(lat, lon) => updateAttributesFor(lat, lon)}
            cities={renderCities}
          />
        </Canvas>
      </div>

      {/* pannello info SOTTO il globo, font ridotto */}
      <div
        className="rounded-xl shadow-md border border-neutral-200 bg-white/85 backdrop-blur mt-2 text-sm"
        style={{ padding: 10 }}
      >
        <div className="grid gap-x-8 gap-y-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div>Lat: {picked ? picked.lat.toFixed(4) : "-"}</div>
            <div>Lon: {picked ? picked.lon.toFixed(4) : "-"}</div>
            <div className="flex items-center gap-3 mt-2">
              <span>City radius (km):</span>
              <input
                type="range"
                min={5}
                max={500}
                step={5}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
              />
              <span style={{ width: 40, textAlign: "right" }}>{radiusKm}</span>
            </div>
          </div>
          <div>
            <div>Continent: {continent || "-"}</div>
            <div>Country: {country || "-"}</div>
            <div>Nearest city: {nearestCity || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Scene({
  radius,
  onPick,
  cities,
}: {
  radius: number;
  onPick: (lat: number, lon: number) => void;
  cities: CitiesEntry[];
}) {
  useEuropeStart(radius);
  const [marker, setMarker] = React.useState<THREE.Vector3 | null>(null);

  const handlePick = (lat: number, lon: number) => {
    const p = latLonToVector3(lat, lon, radius + 0.01);
    setMarker(p);
    onPick(lat, lon);
  };

  useFrame(() => {});

  return (
    <>
      <GlobeMesh radius={radius} onPick={handlePick} />
      {cities.length > 0 && <CityDots radius={radius} cities={cities} />}
      {marker && (
        <mesh position={marker}>
          <sphereGeometry args={[0.006, 16, 16]} />
          <meshBasicMaterial color="#ff0000ff" toneMapped={false} />
        </mesh>
      )}
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.8}
        minDistance={1.7}
        maxDistance={4.0}
        zoomSpeed={0.8}
      />
    </>
  );
}
