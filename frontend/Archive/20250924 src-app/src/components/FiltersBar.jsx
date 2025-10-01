// src/components/FiltersBar.jsx
"use client";

import { useEffect, useState, useRef } from "react";
import { getOptions } from "../lib/api";

/**
 * FiltersBar (modern + Search + Auto-Apply on Group)
 *
 * Props:
 * - lang,setLang
 * - q,setQ
 * - continent,setContinent
 * - country,setCountry
 * - location,setLocation
 * - group,setGroup
 * - period: { start, end }
 * - onApply: () => void                 // lancia la ricerca (chiude il drawer dalla pagina)
 * - onFiltersChanged?: () => void       // (opz.) solo per aggiornare la querystring live
 * - onClose?: () => void                // (opz.) se vuoi chiudere dal componente
 */
export default function FiltersBar({
  lang, setLang,
  q, setQ,
  continent, setContinent,
  country, setCountry,
  location, setLocation,
  group, setGroup,
  period,
  onApply,
  onFiltersChanged,
  onClose,
}) {
  const [continents, setContinents] = useState([]);
  const [countries,  setCountries]  = useState([]);
  const [locations,  setLocations]  = useState([]);
  const [groups,     setGroups]     = useState([]);

  const YS = period?.start ?? undefined;
  const YE = period?.end   ?? undefined;

  const qRef = useRef(q);
  useEffect(() => { qRef.current = q; }, [q]);

  // Bootstrap: carica continenti e gruppi
  useEffect(() => {
    (async () => {
      try {
        const [cts, grs] = await Promise.all([
          getOptions("continents", { year_start: YS, year_end: YE }),
          getOptions("groups",     { year_start: YS, year_end: YE, lang: (lang || "it").toUpperCase() }),
        ]);
        setContinents(cts || []);
        setGroups(grs || []);
      } catch (e) { console.error(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aggiorna gruppi quando cambiano lingua/geo/periodo/search
  useEffect(() => {
    (async () => {
      try {
        const grs = await getOptions("groups", {
          year_start: YS, year_end: YE,
          lang: (lang || "it").toUpperCase(),
          continent: continent || undefined,
          country:   country   || undefined,
          location:  location  || undefined,
          q: qRef.current || undefined,
        });
        setGroups(grs || []);
      } catch (e) { console.error(e); }
    })();
  }, [lang, continent, country, location, YS, YE]);

  // Ricarica liste gerarchiche su dipendenze
  useEffect(() => {
    (async () => {
      try {
        const [cts, cys, locs] = await Promise.all([
          getOptions("continents", { year_start: YS, year_end: YE, group: group || undefined, q: qRef.current || undefined }),
          getOptions("countries",  { year_start: YS, year_end: YE, continent: continent || undefined, group: group || undefined, q: qRef.current || undefined }),
          getOptions("locations",  { year_start: YS, year_end: YE, continent: continent || undefined, country: country || undefined, group: group || undefined, q: qRef.current || undefined }),
        ]);
        setContinents(cts || []); setCountries(cys || []); setLocations(locs || []);
      } catch (e) { console.error(e); }
    })();
  }, [group, continent, country, YS, YE]);

  // Handlers
  const handleLangChange = async (e) => {
    const newLang = e.target.value;
    setLang?.(newLang);
    try {
      const grs = await getOptions("groups", {
        year_start: YS, year_end: YE,
        lang: (newLang || "it").toUpperCase(),
        continent: continent || undefined,
        country:   country   || undefined,
        location:  location  || undefined,
        q: qRef.current || undefined,
      });
      setGroups(grs || []);
    } catch (e) { console.error(e); }
  };

  const handleGroupChange = async (e) => {
    const newGroup = e.target.value;
    setGroup(newGroup);
    try {
      const [cts, cys, locs, grs] = await Promise.all([
        getOptions("continents", { year_start: YS, year_end: YE, group: newGroup || undefined, q: qRef.current || undefined }),
        getOptions("countries",  { year_start: YS, year_end: YE, continent: continent || undefined, group: newGroup || undefined, q: qRef.current || undefined }),
        getOptions("locations",  { year_start: YS, year_end: YE, continent: continent || undefined, country: country || undefined, group: newGroup || undefined, q: qRef.current || undefined }),
        getOptions("groups",     { year_start: YS, year_end: YE, lang: (lang || "it").toUpperCase(), continent: continent || undefined, country: country || undefined, location: location || undefined, group: newGroup || undefined, q: qRef.current || undefined }),
      ]);
      setContinents(cts || []); setCountries(cys || []); setLocations(locs || []); setGroups(grs || []);
    } catch (e) { console.error(e); }
    // AUTO-APPLY: applica subito e lascia che la pagina chiuda il drawer
    onApply?.();
  };

  const handleContinentChange = async (e) => {
    const newCont = e.target.value;
    setContinent(newCont);
    setCountry(""); setLocation("");
    try {
      const [cys, locs, grs] = await Promise.all([
        getOptions("countries",  { year_start: YS, year_end: YE, continent: newCont || undefined, group: group || undefined, q: qRef.current || undefined }),
        getOptions("locations",  { year_start: YS, year_end: YE, continent: newCont || undefined, group: group || undefined, q: qRef.current || undefined }),
        getOptions("groups",     { year_start: YS, year_end: YE, lang: (lang || "it").toUpperCase(), continent: newCont || undefined, q: qRef.current || undefined }),
      ]);
      setCountries(cys || []); setLocations(locs || []); setGroups(grs || []);
    } catch (e) { console.error(e); }
  };

  const handleCountryChange = async (e) => {
    const newCty = e.target.value;
    setCountry(newCty);
    setLocation("");
    try {
      const [locs, grs] = await Promise.all([
        getOptions("locations", { year_start: YS, year_end: YE, continent: continent || undefined, country: newCty || undefined, group: group || undefined, q: qRef.current || undefined }),
        getOptions("groups",    { year_start: YS, year_end: YE, lang: (lang || "it").toUpperCase(), continent: continent || undefined, country: newCty || undefined, q: qRef.current || undefined }),
      ]);
      setLocations(locs || []); setGroups(grs || []);
    } catch (e) { console.error(e); }
  };

  const handleLocationChange = async (e) => {
    const newLoc = e.target.value;
    setLocation(newLoc);
    try {
      const grs = await getOptions("groups", {
        year_start: YS, year_end: YE,
        lang: (lang || "it").toUpperCase(),
        continent: continent || undefined,
        country:   country   || undefined,
        location:  newLoc    || undefined,
        q: qRef.current || undefined,
      });
      setGroups(grs || []);
    } catch (e) { console.error(e); }
  };

  const doSearch = () => onApply?.();
  const onKeyDownInput = (e) => { if (e.key === "Enter") doSearch(); };

  // UI
  return (
    <div className="ghf-wrap">
      <div className="ghf-card">
        {/* Lingua */}
        <div className="ghf-row">
          <label className="ghf-lbl">Language</label>
          <select className="ghf-ctl" value={lang || "it"} onChange={handleLangChange}>
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* Journey / Group */}
        <div className="ghf-row">
          <label className="ghf-lbl">Journey (Group)</label>
          <select className="ghf-ctl" value={group || ""} onChange={handleGroupChange}>
            <option value="">All</option>
            {groups.map((g) => (
              <option key={g.value || g.code || g.id || g.name} value={g.value || g.code || g.id || g.name}>
                {g.label || g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Geo */}
        <div className="ghf-grid">
          <div className="ghf-row">
            <label className="ghf-lbl">Continent</label>
            <select className="ghf-ctl" value={continent || ""} onChange={handleContinentChange}>
              <option value="">All</option>
              {continents.map((c) => (
                <option key={c.value || c.code || c.id || c.name} value={c.value || c.code || c.id || c.name}>
                  {c.label || c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ghf-row">
            <label className="ghf-lbl">Country</label>
            <select className="ghf-ctl" value={country || ""} onChange={handleCountryChange}>
              <option value="">All</option>
              {countries.map((c) => (
                <option key={c.value || c.code || c.id || c.name} value={c.value || c.code || c.id || c.name}>
                  {c.label || c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ghf-row">
            <label className="ghf-lbl">Location</label>
            <select className="ghf-ctl" value={location || ""} onChange={handleLocationChange}>
              <option value="">All</option>
              {locations.map((l) => (
                <option key={l.value || l.code || l.id || l.name} value={l.value || l.code || l.id || l.name}>
                  {l.label || l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="ghf-row">
          <label className="ghf-lbl">Search</label>
          <input
            className="ghf-ctl"
            placeholder="Find topics, places or people…"
            value={q || ""}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDownInput}
          />
        </div>

        {/* Actions */}
        <div className="ghf-actions">
          <button type="button" className="ghf-btn ghf-btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="ghf-btn ghf-btn-primary" onClick={doSearch}>Search</button>
        </div>
      </div>

      {/* stile moderno, card glass */}
      <style jsx>{`
        .ghf-wrap { padding: 16px; }
        .ghf-card {
          position: relative;
          z-index: 2;
          background: rgba(255,255,255,0.85);
          backdrop-filter: saturate(1.1) blur(4px);
          border: 1px solid rgba(17,24,39,.08);
          border-radius: 16px;
          box-shadow: 0 6px 20px rgba(17,24,39,.06);
          padding: 16px;
          display: grid;
          gap: 14px;
        }
        .ghf-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 720px) {
          .ghf-grid { grid-template-columns: 1fr 1fr 1fr; }
        }
        .ghf-row { display: grid; gap: 6px; }
        .ghf-lbl { font-weight: 700; font-size: 12px; color: #374151; letter-spacing: .02em; }
        .ghf-ctl {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 14px;
          color: #111827;
          background: #fff;
          outline: none;
          transition: border-color .15s ease, box-shadow .15s ease;
          appearance: none;
        }
        .ghf-ctl:focus { border-color: #93c5fd; box-shadow: 0 0 0 4px rgba(59,130,246,0.18); }
        .ghf-ctl:disabled { opacity: .6; background: #f9fafb; cursor: not-allowed; }
        .ghf-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 4px;
        }
        .ghf-btn {
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          border: 1px solid transparent;
          cursor: pointer;
        }
        .ghf-btn-primary {
          background: #111827;
          color: #fff;
          border-color: rgba(255,255,255,.08);
          box-shadow: 0 8px 22px rgba(17,24,39,.18);
        }
        .ghf-btn-primary:hover { opacity: .9; }
        .ghf-btn-ghost {
          background: #fff;
          color: #111827;
          border-color: #e5e7eb;
        }
        .ghf-btn-ghost:hover { background: #f9fafb; }
      `}</style>
    </div>
  );
}
