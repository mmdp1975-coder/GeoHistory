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

const MIN_EFFECTIVE_RADIUS_KM = 150;

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

function useEuropeStart(
  radius: number,
  embedded: boolean,
  startFullyZoomedOut: boolean
) {
  const { camera } = useThree();
  React.useEffect(() => {
    const targetLat = 47;
    const targetLon = 10;
    const camDist = radius * (embedded ? (startFullyZoomedOut ? 4.1 : 2.25) : 1.7);
    const look = new THREE.Vector3(0, 0, 0);
    const pos = latLonToVector3(targetLat, targetLon, radius)
      .normalize()
      .multiplyScalar(camDist);

    camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }, [camera, embedded, radius, startFullyZoomedOut]);
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
  onClearPointSelect,
  initialRadiusKm,
  clearSelectionSignal = 0,
  height,
  radius: globeRadius,
  embedded = false,
  footerPosition = "bottom",
  startFullyZoomedOut = false,
  onExitEmbeddedMap,
}: {
  onPointSelect?: (info: {
    lat: number;
    lon: number;
    continent?: string;
    country?: string;
    city?: string;
    radiusKm: number;
  }) => void;
  onClearPointSelect?: () => void;
  initialRadiusKm?: number;
  clearSelectionSignal?: number;
  height?: number; // default 700
  radius?: number;
  embedded?: boolean;
  footerPosition?: "top" | "bottom";
  startFullyZoomedOut?: boolean;
  onExitEmbeddedMap?: () => void;
}) {
  const radius = typeof globeRadius === "number" ? globeRadius : 1.0;
  const containerRef = React.useRef<HTMLDivElement | null>(null);

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

  const [radiusKm, setRadiusKm] = React.useState(initialRadiusKm ?? 1500);
  const effectiveRadiusKm = Math.max(MIN_EFFECTIVE_RADIUS_KM, radiusKm);

  const resetPickedPointState = React.useCallback(() => {
    setPicked(null);
    setContinent("");
    setCountry("");
    setNearestCity("");
  }, []);

  const clearPickedPoint = React.useCallback(() => {
    resetPickedPointState();
    onClearPointSelect?.();
  }, [onClearPointSelect, resetPickedPointState]);

  React.useEffect(() => {
    resetPickedPointState();
  }, [resetPickedPointState, clearSelectionSignal]);

  const updateAttributesFor = React.useCallback(
    (lat: number, lon: number) => {
      const normalizedLon = canonicalLon(lon);
      setPicked({ lat, lon: normalizedLon });

      let nextContinent = "Unknown";
      let nextCountry = "Unknown";
      let nextNearestCity = nearestCity || "Unknown";

      if (!dataReady) {
        setContinent("-");
        setCountry("-");
        const cb = onPointSelectRef.current;
        if (cb) {
          cb({
            lat,
            lon: normalizedLon,
            continent: "-",
            country: "-",
            city: nextNearestCity,
            radiusKm: effectiveRadiusKm,
          });
        }
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
      nextContinent = contName || "Unknown";
      setContinent(nextContinent);

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
      nextCountry = countryName || "Unknown";
      setCountry(nextCountry);

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
        nextNearestCity = bestIdx >= 0 ? citiesData[bestIdx].name : "Unknown";
        setNearestCity(nextNearestCity);
      }

      const cb = onPointSelectRef.current;
      if (cb) {
        cb({
          lat,
          lon: normalizedLon,
          continent: nextContinent,
          country: nextCountry,
          city: nextNearestCity,
          radiusKm: effectiveRadiusKm,
        });
      }
    },
    [
      dataReady,
      continentsData,
      countriesData,
      citiesData,
      nearestCity,
      effectiveRadiusKm,
    ]
  );

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
        radiusKm: effectiveRadiusKm,
      });
    }
  }, [picked, continent, country, nearestCity, effectiveRadiusKm]);

  const renderCities = React.useMemo(() => thinCities(citiesData), [citiesData]);

  const globeHeight =
    typeof height === "number"
      ? Math.max(320, height - (embedded ? 0 : 12))
      : undefined;

  const cursorStyle = React.useMemo(() => {
    if (hoveringCity) return "pointer";
    return dragging ? "grabbing" : "grab";
  }, [dragging, hoveringCity]);

  const displayUnknown = (value: string) => {
    if (!value) return "-";
    if (value === "Unknown") return tUI(langCode, "globe.unknown");
    return value;
  };

  const compactInfo = embedded && footerPosition === "top";

  const infoPanel = (
    <div
      className={`shrink-0 bg-[linear-gradient(180deg,rgba(255,252,246,0.88),rgba(247,242,234,0.72))] text-xs sm:text-sm ${
        footerPosition === "top"
          ? "border-b border-[rgba(18,49,78,0.08)]"
          : "border-t border-[rgba(18,49,78,0.08)]"
      }`}
      style={{
        padding: compactInfo ? "6px 8px" : "6px 8px 10px 8px",
        position: "relative",
        zIndex: 5,
      }}
    >
        <div
          className={
            compactInfo
              ? "grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11px] leading-4"
              : "grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2"
          }
        >
          <div className="min-w-0">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="min-w-0 truncate">
              <span className="text-neutral-700">
                {tUI(langCode, "globe.footer.lat")}
              </span>{" "}
              <span className="break-words font-semibold text-neutral-950">
                {picked ? picked.lat.toFixed(4) : "-"}
              </span>
            </div>
            <div className="min-w-0 truncate">
              <span className="text-neutral-700">
                {tUI(langCode, "globe.footer.lon")}
              </span>{" "}
              <span className="break-words font-semibold text-neutral-950">
                {picked ? picked.lon.toFixed(4) : "-"}
              </span>
            </div>
          </div>
          <div
            className={`${
              compactInfo ? "mt-1.5" : "mt-2"
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="whitespace-nowrap text-neutral-700">
                {tUI(langCode, "globe.footer.city_radius")}
              </span>
              <span
                className="font-semibold text-[var(--geo-navy)]"
                style={{ width: compactInfo ? 52 : 60, textAlign: "right" }}
              >
                {radiusKm}
              </span>
            </div>
            <input
              className="block w-full"
              type="range"
              min={25}
              max={5000}
              step={25}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="min-w-0 break-words">
          <div className={compactInfo ? "truncate" : undefined}>
            <span className="text-neutral-700">
              {tUI(langCode, "globe.footer.continent")}
            </span>{" "}
            <span className="break-words font-semibold text-neutral-950">
              {displayUnknown(continent)}
            </span>
          </div>
          <div className={compactInfo ? "truncate" : undefined}>
            <span className="text-neutral-700">
              {tUI(langCode, "globe.footer.country")}
            </span>{" "}
            <span className="break-words font-semibold text-neutral-950">
              {displayUnknown(country)}
            </span>
          </div>
          <div className={compactInfo ? "truncate" : undefined}>
            <span className="text-neutral-700">
              {tUI(langCode, "globe.footer.nearest_city")}
            </span>{" "}
            <span className="break-words font-semibold text-neutral-950">
              {displayUnknown(nearestCity)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={
        embedded
          ? "flex h-full min-h-0 flex-col overflow-hidden bg-transparent"
          : "overflow-hidden rounded-[28px] border border-[rgba(18,49,78,0.08)] bg-[rgba(255,252,246,0.72)] backdrop-blur-xl"
      }
    >
      {footerPosition === "top" ? infoPanel : null}
      <div
        style={{
          width: "100%",
          height: globeHeight ?? "100%",
          cursor: cursorStyle,
          position: "relative",
          overflow: "hidden",
          flex: embedded ? "1 1 auto" : undefined,
          background:
            "radial-gradient(circle at 50% 36%, rgba(132,176,232,0.18) 0%, rgba(88,132,196,0.16) 20%, rgba(34,68,116,0.2) 36%, rgba(9,20,41,0.88) 60%, rgba(2,6,16,1) 100%), linear-gradient(180deg, rgba(76,108,164,0.1) 0%, rgba(14,26,49,0.82) 28%, rgba(4,9,20,0.98) 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 104%, rgba(118,182,255,0.2) 0%, rgba(118,182,255,0.14) 18%, rgba(108,162,236,0.08) 34%, transparent 66%), radial-gradient(ellipse at 50% 88%, rgba(198,224,255,0.1) 0%, rgba(198,224,255,0.04) 28%, transparent 58%)",
            mixBlendMode: "screen",
            opacity: 0.9,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(circle at 50% 28%, rgba(226,239,255,0.08) 0%, rgba(226,239,255,0.03) 12%, transparent 24%), radial-gradient(circle at 50% 120%, rgba(90,144,220,0.1) 0%, transparent 28%)",
            mixBlendMode: "screen",
            opacity: 0.7,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 16%, rgba(255,255,255,0.12) 0 1px, transparent 1.7px), radial-gradient(circle at 78% 22%, rgba(255,255,255,0.1) 0 1px, transparent 1.8px), radial-gradient(circle at 66% 72%, rgba(255,255,255,0.06) 0 1px, transparent 1.7px), radial-gradient(circle at 28% 66%, rgba(255,255,255,0.05) 0 1px, transparent 1.9px), radial-gradient(circle at 50% 44%, rgba(153,205,255,0.1), transparent 42%)",
            backgroundSize: "260px 260px, 320px 320px, 360px 360px, 420px 420px, 100% 100%",
            opacity: 0.62,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[42%]"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(7,18,35,0.1) 26%, rgba(9,22,43,0.24) 52%, rgba(118,178,242,0.12) 82%, rgba(178,216,255,0.14) 100%)",
            filter: "blur(8px)",
            opacity: 0.92,
          }}
        />
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          {picked ? (
            <button
              type="button"
              onClick={clearPickedPoint}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-[11px] font-medium text-white shadow-sm transition hover:bg-white/12"
              title="Clear geo filter"
              aria-label="Clear geo filter"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="m6 6 12 12" strokeLinecap="round" />
                <path d="m18 6-12 12" strokeLinecap="round" />
              </svg>
              <span>Clear geo filter</span>
            </button>
          ) : null}
          {embedded && onExitEmbeddedMap ? (
            <button
              type="button"
              onClick={onExitEmbeddedMap}
              className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-full border border-white/10 bg-white/8 text-white shadow-sm transition hover:bg-white/12"
              title="Timeline"
              aria-label="Timeline"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 6.5h16l-6.3 7.2v4.8l-3.4-1.8v-3Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>
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
          <ambientLight intensity={1.02} color="#c7ddff" />
          <directionalLight position={[6, 3.2, 5]} intensity={1.18} color="#eef5ff" />
          <directionalLight position={[-5, -2, -5]} intensity={0.58} color="#7aaef0" />

          <Scene
            radius={radius}
            embedded={embedded}
            startFullyZoomedOut={startFullyZoomedOut}
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
      {footerPosition === "bottom" ? infoPanel : null}
    </div>
  );
}

function Scene({
  radius,
  embedded,
  startFullyZoomedOut,
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
  embedded: boolean;
  startFullyZoomedOut: boolean;
  onPickGlobePoint: (lat: number, lon: number) => void;
  cities: CitiesEntry[];
  onDragStart: () => void;
  onDragEnd: () => void;
  onPickCity: (lat: number, lon: number, cityName: string) => void;
  setHoveringCity: (b: boolean) => void;
  markerPosition: THREE.Vector3 | null;
  markerSize: number;
}) {
  useEuropeStart(radius, embedded, startFullyZoomedOut);

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
        rotateSpeed={0.55}
        minDistance={embedded ? 1.7 : 1.25}
        maxDistance={embedded ? 4.1 : 3.2}
        zoomSpeed={0.28}
      />
    </>
  );
}
