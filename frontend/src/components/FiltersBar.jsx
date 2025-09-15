// src/components/FiltersBar.jsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getOptions } from "../lib/api";

/**
 * Modifiche principali:
 * - RIMOSSE tutte le occorrenze di year_start/year_end nelle getOptions(...)
 * - NIENTE conteggi nelle label delle option (mostriamo solo il nome).
 * - Debounce per la search invariato; API dei prop invariata.
 */

export default function FiltersBar({
  lang, setLang,
  q, setQ,
  continent, setContinent,
  country, setCountry,
  location, setLocation,
  group, setGroup,
  period,
  onFiltersChanged
}) {
  const [continents, setContinents] = useState([]);
  const [countries,  setCountries]  = useState([]);
  const [locations,  setLocations]  = useState([]);
  const [groups,     setGroups]     = useState([]);

  const notify = useCallback((kind) => onFiltersChanged?.(kind), [onFiltersChanged]);

  /* =============== Debounce per la search =============== */
  const qRef = useRef(q);
  useEffect(() => { qRef.current = q; }, [q]);
  useEffect(() => {
    const id = setTimeout(() => { notify("q"); }, 350);
    return () => clearTimeout(id);
  }, [q, notify]);

  /* ================= BOOTSTRAP ================= */
  useEffect(() => {
    (async () => {
      try {
        const [cts, grs] = await Promise.all([
          getOptions("continents", {}),
          getOptions("groups",     { lang: (lang || "it").toUpperCase() }),
        ]);
        setContinents(cts || []);
        setGroups(grs || []);
      } catch (e) { console.error(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ======== AGGIORNA GRUPPI SU CAMBI LINGUA/GEOGRAFIA ======== */
  useEffect(() => {
    (async () => {
      try {
        const grs = await getOptions("groups", {
          lang: (lang || "it").toUpperCase(),
          continent: continent || undefined,
          country:   country   || undefined,
          location:  location  || undefined,
          q: qRef.current || undefined,
        });
        setGroups(grs || []);
      } catch (e) { console.error(e); }
    })();
  }, [lang, continent, country, location]);

  /* ======== RICARICA LISTE GERARCHICHE QUANDO CAMBIANO I PADRI ======== */
  useEffect(() => {
    (async () => {
      try {
        const [cts, cys, locs] = await Promise.all([
          getOptions("continents", { group: group || undefined, q: qRef.current || undefined } ),
          getOptions("countries",  { continent: continent || undefined, group: group || undefined, q: qRef.current || undefined }),
          getOptions("locations",  { continent: continent || undefined, country: country || undefined, group: group || undefined, q: qRef.current || undefined }),
        ]);
        setContinents(cts || []); setCountries(cys || []); setLocations(locs || []);
      } catch (e) { console.error(e); }
    })();
  }, [continent, country, group]);

  /* ================= HANDLERS ================= */
  const handleLangChange = async (e) => {
    const newLang = e.target.value;
    setLang(newLang);
    try {
      const grs = await getOptions("groups", {
        lang: newLang.toUpperCase(),
        continent: continent || undefined,
        country:   country   || undefined,
        location:  location  || undefined,
        q: qRef.current || undefined,
      });
      setGroups(grs || []);
    } catch (err) { console.error(err); }
    notify("lang");
  };

  const handleGroupChange = async (e) => {
    const newGroup = e.target.value;
    setGroup(newGroup);
    // reset gerarchia geo
    setContinent(""); setCountry(""); setLocation("");
    try {
      const [cts, cys, locs, grs] = await Promise.all([
        getOptions("continents", { group: newGroup || undefined, q: qRef.current || undefined }),
        getOptions("countries",  { group: newGroup || undefined, q: qRef.current || undefined }),
        getOptions("locations",  { group: newGroup || undefined, q: qRef.current || undefined }),
        getOptions("groups",     { lang: (lang || "it").toUpperCase(), group: newGroup || undefined, q: qRef.current || undefined }),
      ]);
      setContinents(cts || []); setCountries(cys || []); setLocations(locs || []); setGroups(grs || []);
    } catch (err) { console.error(err); }
    notify("group");
  };

  const handleContinentChange = async (e) => {
    const newCont = e.target.value;
    setContinent(newCont);
    setCountry(""); setLocation("");
    try {
      const [cys, locs, grs] = await Promise.all([
        getOptions("countries", { continent: newCont || undefined, group: group || undefined, q: qRef.current || undefined }),
        getOptions("locations", { continent: newCont || undefined, group: group || undefined, q: qRef.current || undefined }),
        getOptions("groups",    { lang: (lang || "it").toUpperCase(), continent: newCont || undefined, q: qRef.current || undefined }),
      ]);
      setCountries(cys || []); setLocations(locs || []); setGroups(grs || []);
    } catch (err) { console.error(err); }
    notify("continent");
  };

  const handleCountryChange = async (e) => {
    const newCty = e.target.value;
    setCountry(newCty);
    setLocation("");
    try {
      const [locs, grs] = await Promise.all([
        getOptions("locations", { continent: continent || undefined, country: newCty || undefined, group: group || undefined, q: qRef.current || undefined }),
        getOptions("groups",    { lang: (lang || "it").toUpperCase(), continent: continent || undefined, country: newCty || undefined, q: qRef.current || undefined }),
      ]);
      setLocations(locs || []); setGroups(grs || []);
    } catch (err) { console.error(err); }
    notify("country");
  };

  const handleLocationChange = async (e) => {
    const newLoc = e.target.value;
    setLocation(newLoc);
    try {
      const grs = await getOptions("groups", {
        lang: (lang || "it").toUpperCase(),
        continent: continent || undefined,
        country:   country   || undefined,
        location:  newLoc    || undefined,
        q: qRef.current || undefined,
      });
      setGroups(grs || []);
    } catch (err) { console.error(err); }
    notify("location");
  };

  const handleSearchChange = (e) => {
    setQ(e.target.value);
    // la notify la fa il debounce
  };

  const handleReset = async () => {
    const baseLang = (process.env.NEXT_PUBLIC_LANG || "it").toLowerCase();
    setLang(baseLang); setQ(""); setGroup(""); setContinent(""); setCountry(""); setLocation("");
    try {
      const [cts, grs] = await Promise.all([
        getOptions("continents", {}),
        getOptions("groups",     { lang: baseLang.toUpperCase() }),
      ]);
      setContinents(cts || []); setCountries([]); setLocations([]); setGroups(grs || []);
    } catch (err) { console.error(err); }
    onFiltersChanged?.("reset");
  };

  return (
    <div className="gh-filters">
      <div className="wrap">
        <div className="top">
          <h2>Filters</h2>
          <button type="button" className="btn" onClick={handleReset}>Reset</button>
        </div>

        <div className="stack">
          {/* Language */}
          <div className="card">
            <label className="label">Language</label>
            <select aria-label="Language" className="control" value={lang} onChange={handleLangChange}>
              <option value="it">Italian</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Search */}
          <div className="card">
            <label className="label">Search</label>
            <input
              aria-label="Search"
              type="text"
              placeholder="Type to search…"
              className="control"
              value={q}
              onChange={handleSearchChange}
            />
            <div className="help">Filter by title/description/tags, case & accent-insensitive.</div>
          </div>

          {/* Group Event */}
          <div className="card">
            <label className="label">Group Event</label>
            <select aria-label="Group Event" className="control" value={group} onChange={handleGroupChange}>
              <option value="">All Group Events</option>
              {groups.map(g => (
                <option key={g.value} value={g.value}>
                  {g.label || g.value}
                </option>
              ))}
            </select>
          </div>

          {/* Geography (raggruppata) */}
          <div className="card">
            <div className="geoHeader">Geography</div>
            <div className="geoGrid">
              <div className="geoField">
                <label className="label">Continent</label>
                <select
                  aria-label="Continent"
                  className="control"
                  value={continent}
                  onChange={handleContinentChange}
                >
                  <option value="">All Continents</option>
                  {continents.map(c => (
                    <option key={c.value} value={c.value}>
                      {c.label || c.value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="geoField">
                <label className="label">Country</label>
                <select
                  aria-label="Country"
                  className="control"
                  value={country}
                  onChange={handleCountryChange}
                  disabled={!continent}
                >
                  <option value="">All Countries</option>
                  {countries.map(c => (
                    <option key={c.value} value={c.value}>
                      {c.label || c.value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="geoField">
                <label className="label">Location</label>
                <select
                  aria-label="Location"
                  className="control"
                  value={location}
                  onChange={handleLocationChange}
                  disabled={!country}
                >
                  <option value="">All Locations</option>
                  {locations.map(l => (
                    <option key={l.value} value={l.value}>
                      {l.label || l.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== STYLES (scoped) ====== */}
      <style jsx>{`
        .gh-filters {
          position: sticky;
          top: 0;
          z-index: 30;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: saturate(180%) blur(6px);
          -webkit-backdrop-filter: saturate(180%) blur(6px);
          border-bottom: 1px solid #e5e7eb;
        }
        .wrap {
          max-width: 820px;
          margin: 0 auto;
          padding: 10px 14px 16px;
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .top h2 {
          font-size: 20px;
          line-height: 1.2;
          margin: 0;
          color: #1f2937;
          font-weight: 800;
          letter-spacing: 0.2px;
        }
        .btn {
          height: 40px;
          padding: 0 14px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          box-shadow: 0 1px 1px rgba(0,0,0,0.04);
          transition: box-shadow .15s ease, background .15s ease;
          cursor: pointer;
        }
        .btn:hover { background: #f9fafb; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }

        .stack { display: grid; grid-template-columns: 1fr; gap: 14px; }

        .card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 12px 14px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          transition: box-shadow .18s ease, transform .18s ease;
        }
        .card:hover { box-shadow: 0 6px 18px rgba(16,24,40,0.06); }

        .label {
          display: block;
          margin-bottom: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          letter-spacing: .2px;
        }
        .help {
          margin-top: 6px;
          font-size: 11px;
          color: #9ca3af;
        }
        .control {
          width: 100%;
          height: 44px;
          padding: 8px 12px;
          font-size: 14px;
          color: #111827;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          outline: none;
          box-shadow: 0 0 0 0 rgba(59,130,246,0);
          transition: border-color .15s ease, box-shadow .15s ease;
          appearance: none;
        }
        .control:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,0.25); }
        .control:disabled { opacity: .55; background: #f9fafb; cursor: not-allowed; }

        .geoHeader { font-weight: 700; font-size: 14px; color: #374151; margin: 0 0 8px 0; }
        .geoGrid   { display: grid; grid-template-columns: 1fr; gap: 10px; }
      `}</style>
    </div>
  );
}
