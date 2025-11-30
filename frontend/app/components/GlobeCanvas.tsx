"use client";
import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, useTexture } from "@react-three/drei";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { tUI } from "@/lib/i18n/uiLabels";

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

/* ---------- PIP helpers ---------- */

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
  if (geom.type === "Polygon") return isPointInPolygonRings(pt, geom.coordinates);
  if (geom.type === "MultiPolygon")
    return geom.coordinates.some((poly: number[][][]) => isPointInPolygonRings(pt, poly));
  return false;
}

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
  const { camera } = useThree();
  React.useEffect(() => {
    const targetLat = 47;
    const targetLon = 10;
    const camDist = radius * 1.7;
    const look = new THREE.Vector3(0, 0, 0);
    const pos = latLonToVector3(targetLat, targetLon, radius)
      .normalize()
      .multiplyScalar(camDist);

    camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }, [camera, radius]);
}

function CityDots({
  radius,
  cities,
  onPickCity,
  setHoveringCity,
}: {
  radius: number;
  cities: CitiesEntry[];
  onPickCity: (lat: number, lon: number, cityName: string) => void;
  setHoveringCity: (b: boolean) => void;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const [hoverPos, setHoverPos] = React.useState<THREE.Vector3 | null>(null);

  const positions = React.useMemo(
    () => cities.map((c) => latLonToVector3(c.latitude, c.longitude, radius + 0.003)),
    [cities, radius]
  );

  const geom = React.useMemo(() => new THREE.SphereGeometry(0.002, 12, 12), []);
  const mat = React.useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#ffd166", toneMapped: false }),
    []
  );

  const { camera, gl } = useThree();
  const raycaster = React.useMemo(() => new THREE.Raycaster(), []);
  const pointer = React.useRef(new THREE.Vector2());

  const updateNearest = (clientX: number, clientY: number) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    pointer.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

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
    return { minIdx, minDist };
  };

  // Utility per sicurezza: rilascia eventuale capture sul target
  const releaseCapture = (e: ThreeEvent<PointerEvent>) => {
    const tgt: any = e.target;
    try {
      // @ts-ignore
      tgt?.releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const { minIdx, minDist } = updateNearest(e.clientX, e.clientY);
    if (minIdx >= 0 && minDist < 0.15) {
      setHover(minIdx);
      setHoverPos(positions[minIdx]);
      setHoveringCity(true);
    } else {
      setHover(null);
      setHoverPos(null);
      setHoveringCity(false);
    }
  };

  const onPointerLeave = () => {
    setHover(null);
    setHoverPos(null);
    setHoveringCity(false);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    releaseCapture(e);
    const { minIdx, minDist } = updateNearest(e.clientX, e.clientY);
    if (minIdx >= 0 && minDist < 0.12) {
      const c = cities[minIdx];
      onPickCity(c.latitude, c.longitude, c.name);
    }
  };

  return (
    <group onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerUp={onPointerUp}>
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
  onPickGlobePoint,
  onDragStart,
  onDragEnd,
}: {
  radius: number;
  onPickGlobePoint: (lat: number, lon: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
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

  const releaseCapture = (e: ThreeEvent<PointerEvent>) => {
    const tgt: any = e.target;
    try {
      // @ts-ignore
      tgt?.releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    releaseCapture(e);
    onDragStart();
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    releaseCapture(e);
    onDragEnd();

    const p = e.point as THREE.Vector3;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
      const { lat, lon } = vector3ToLatLon(p);
      onPickGlobePoint(lat, lon);
    }
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    // fallback per assicurare il pick anche se pointerup non scatta
    const p = e.point as THREE.Vector3;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
      const { lat, lon } = vector3ToLatLon(p);
      onPickGlobePoint(lat, lon);
    }
  };

  const handlePointerCancel = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    releaseCapture(e);
    onDragEnd();
  };

  return (
    <mesh
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
    >
      <sphereGeometry args={[radius, 128, 128]} />
      <meshStandardMaterial
        map={colorMap}
        roughness={0.85}
        metalness={0.0}
        envMapIntensity={0.0}
      />
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
  height?: number; // default 700
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

  const [dragging, setDragging] = React.useState(false);
  const [hoveringCity, setHoveringCity] = React.useState(false);

  const supabase = React.useMemo(() => createClientComponentClient(), []);
  const [langCode, setLangCode] = React.useState<string>("en");
  const onPointSelectRef = React.useRef(onPointSelect);
  React.useEffect(() => {
    onPointSelectRef.current = onPointSelect;
  }, [onPointSelect]);

  // lingua: stessa logica degli altri componenti (profiles.id = user.id)
  React.useEffect(() => {
    let active = true;

    async function loadLanguage() {
      const browserLang =
        typeof window !== "undefined" ? window.navigator.language : "en";

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.warn("[GlobeCanvas] auth.getUser error:", userError.message);
        }

        if (!user) {
          if (active) setLangCode(browserLang);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("language_code")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn(
            "[GlobeCanvas] Error reading profiles.language_code:",
            error.message
          );
          if (active) setLangCode(browserLang);
          return;
        }

        if (!data || typeof data.language_code !== "string") {
          if (active) setLangCode(browserLang);
          return;
        }

        const dbLang = (data.language_code as string).trim() || browserLang;
        if (active) setLangCode(dbLang);
      } catch (err: any) {
        console.warn(
          "[GlobeCanvas] Unexpected error loading language:",
          err?.message
        );
        if (active) {
          const browserLang =
            typeof window !== "undefined" ? window.navigator.language : "en";
          setLangCode(browserLang);
        }
      }
    }

    loadLanguage();

    return () => {
      active = false;
    };
  }, [supabase]);

  // ✅ Failsafe globale: qualsiasi pointerup/cancel su window chiude il drag
  React.useEffect(() => {
    const end = () => setDragging(false);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("mouseup", end, true);
    window.addEventListener("touchend", end, true);
    return () => {
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("mouseup", end, true);
      window.removeEventListener("touchend", end, true);
    };
  }, []);

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

  const setCityAsNearest = React.useCallback((name: string) => {
    setNearestCity(name || "Unknown");
  }, []);

  const updateAttributesFor = React.useCallback(
    (lat: number, lon: number) => {
      setPicked({ lat, lon: canonicalLon(lon) });

      if (!dataReady) {
        setContinent("-");
        setCountry("-");
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

      // nearest city — usa tutte le città
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
      }
    },
    [dataReady, continentsData, countriesData, citiesData]
  );

  const [radiusKm, setRadiusKm] = React.useState(initialRadiusKm ?? 250);
  const markerPosition = React.useMemo(() => {
    if (!picked) return null;
    return latLonToVector3(picked.lat, picked.lon, radius + 0.01);
  }, [picked, radius]);
  const markerSize = React.useMemo(() => Math.max(0.0025, 0.0035 * radius), [radius]);

  React.useEffect(() => {
    if (!picked) return;
    const cb = onPointSelectRef.current;
    if (cb) {
      cb({
        lat: picked.lat,
        lon: picked.lon,
        continent,
        country,
        city: nearestCity,
        radiusKm,
      });
    }
  }, [picked, continent, country, nearestCity, radiusKm]);

  const renderCities = React.useMemo(() => thinCities(citiesData), [citiesData]);

  const globeHeight = (typeof height === "number" ? height : 700) - 12;

  const cursorStyle = React.useMemo(() => {
    if (hoveringCity) return "pointer";
    return dragging ? "grabbing" : "grab";
  }, [dragging, hoveringCity]);

  const displayUnknown = (value: string) => {
    if (!value) return "-";
    if (value === "Unknown") return tUI(langCode, "globe.unknown");
    return value;
  };

  return (
    <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white/70 backdrop-blur">
      <div
        style={{
          width: "100%",
          height: globeHeight,
          cursor: cursorStyle,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Canvas
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
          dpr={[1, 2]}
          camera={{ fov: 40, near: 0.1, far: 1000 }}
          gl={{ antialias: true }}
          onPointerMissed={() => {
            setDragging(false);
          }}
          onPointerLeave={() => {
            setDragging(false);
          }}
          onPointerEnter={() => setDragging(false)}
        >
          <ambientLight intensity={1.0} />
          <directionalLight position={[5, 3, 5]} intensity={1.2} />
          <directionalLight position={[-5, -2, -5]} intensity={0.7} />

          <Scene
            radius={radius}
            onPickGlobePoint={(lat, lon) => {
              updateAttributesFor(lat, lon);
            }}
            cities={renderCities}
            onDragStart={() => setDragging(true)}
            onDragEnd={() => setDragging(false)}
            onPickCity={(lat, lon, cityName) => {
              updateAttributesFor(lat, lon);
              setCityAsNearest(cityName);
            }}
            setHoveringCity={setHoveringCity}
            markerPosition={markerPosition}
            markerSize={markerSize}
          />
        </Canvas>
      </div>

      {/* FOOTER COORDINATE */}
      <div
        className="border-t border-neutral-200 bg-white/90 text-xs sm:text-sm"
        style={{
          padding: "6px 8px 10px 8px",
          position: "relative",
          zIndex: 5,
        }}
      >
        <div className="grid gap-x-4 gap-y-2 grid-cols-1 sm:grid-cols-2">
          <div className="min-w-0">
            <div className="whitespace-nowrap">
              {tUI(langCode, "globe.footer.lat")}{" "}
              <span className="break-words">
                {picked ? picked.lat.toFixed(4) : "-"}
              </span>
            </div>
            <div className="whitespace-nowrap">
              {tUI(langCode, "globe.footer.lon")}{" "}
              <span className="break-words">
                {picked ? picked.lon.toFixed(4) : "-"}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2 max-w-[220px]">
              <span className="whitespace-nowrap">
                {tUI(langCode, "globe.footer.city_radius")}
              </span>
              <input
                className="min-w-0 flex-1"
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
          <div className="min-w-0 break-words">
            <div>
              {tUI(langCode, "globe.footer.continent")}{" "}
              <span className="break-words">
                {displayUnknown(continent)}
              </span>
            </div>
            <div>
              {tUI(langCode, "globe.footer.country")}{" "}
              <span className="break-words">
                {displayUnknown(country)}
              </span>
            </div>
            <div>
              {tUI(langCode, "globe.footer.nearest_city")}{" "}
              <span className="break-words">
                {displayUnknown(nearestCity)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Scene({
  radius,
  onPickGlobePoint,
  cities,
  onDragStart,
  onDragEnd,
  onPickCity,
  setHoveringCity,
  markerPosition,
  markerSize,
}: {
  radius: number;
  onPickGlobePoint: (lat: number, lon: number) => void;
  cities: CitiesEntry[];
  onDragStart: () => void;
  onDragEnd: () => void;
  onPickCity: (lat: number, lon: number, cityName: string) => void;
  setHoveringCity: (b: boolean) => void;
  markerPosition: THREE.Vector3 | null;
  markerSize: number;
}) {
  useEuropeStart(radius);

  const handlePickGlobe = (lat: number, lon: number) => {
    onPickGlobePoint(lat, lon);
  };

  const handlePickCity = (lat: number, lon: number, cityName: string) => {
    onPickCity(lat, lon, cityName);
  };

  useFrame(() => {});

  return (
    <>
      <GlobeMesh
        radius={radius}
        onPickGlobePoint={handlePickGlobe}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      {cities.length > 0 && (
        <CityDots
          radius={radius}
          cities={cities}
          onPickCity={handlePickCity}
          setHoveringCity={setHoveringCity}
        />
      )}
      {markerPosition && (
        <mesh position={markerPosition}>
          <sphereGeometry args={[markerSize, 16, 16]} />
          <meshBasicMaterial color="#ff0000ff" toneMapped={false} />
        </mesh>
      )}
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.8}
        minDistance={1.25}
        maxDistance={2.4}
        zoomSpeed={0.8}
      />
    </>
  );
}
