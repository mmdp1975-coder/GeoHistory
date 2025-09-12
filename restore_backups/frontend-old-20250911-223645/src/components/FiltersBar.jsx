"use client";

import { useEffect, useState, useCallback } from "react";
import { getOptions } from "../lib/api";

export default function FiltersBar({
  lang, setLang,
  q, setQ,
  continent, setContinent,
  country, setCountry,
  location, setLocation,
  group, setGroup,
  period,                    // { start, end }
  onFiltersChanged
}) {
  const [continents, setContinents] = useState([]);
  const [countries,  setCountries]  = useState([]);
  const [locations,  setLocations]  = useState([]);
  const [groups,     setGroups]     = useState([]);

  const notify = useCallback((kind) => onFiltersChanged?.(kind), [onFiltersChanged]);

  const ys = period?.start ?? null;
  const ye = period?.end ?? null;

  // Bootstrap iniziale
  useEffect(() => {
    (async () => {
      try {
        const [cts, grs] = await Promise.all([
          getOptions("continents", { year_start: ys, year_end: ye }),
          getOptions("groups", { lang: (lang || "it").toUpperCase(), year_start: ys, year_end: ye }),
        ]);
        setContinents(cts || []);
        setGroups(grs || []);
      } catch (e) { console.error(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aggiorna GRUPPI quando cambia lingua/filtri/periodo
  useEffect(() => {
    (async () => {
      try {
        const grs = await getOptions("groups", {
          lang: (lang || "it").toUpperCase(),
          continent: continent || undefined,
          country:   country   || undefined,
          location:  location  || undefined,
          year_start: ys, year_end: ye,
        });
        setGroups(grs || []);
      } catch (e) { console.error(e); }
    })();
  }, [lang, continent, country, location, ys, ye]);

  // Se cambia il PERIODO o i filtri gerarchici → ricarico liste
  useEffect(() => {
    (async () => {
      try {
        const [cts, cys, locs] = await Promise.all([
          getOptions("continents", { group: group || undefined, year_start: ys, year_end: ye }),
          getOptions("countries",  { continent: continent || undefined, group: group || undefined, year_start: ys, year_end: ye }),
          getOptions("locations",  { continent: continent || undefined, country: country || undefined, group: group || undefined, year_start: ys, year_end: ye }),
        ]);
        setContinents(cts || []);
        setCountries(cys || []);
        setLocations(locs || []);
      } catch (e) { console.error(e); }
    })();
  }, [ys, ye, continent, country, group]);

  // --- HANDLERS ---

  const handleLangChange = async (e) => {
    const newLang = e.target.value;
    setLang(newLang);
    try {
      const grs = await getOptions("groups", {
        lang: newLang.toUpperCase(),
        continent: continent || undefined,
        country:   country   || undefined,
        location:  location  || undefined,
        year_start: ys, year_end: ye,
      });
      setGroups(grs || []);
    } catch (err) { console.error(err); }
    notify("lang");
  };

  const handleGroupChange = async (e) => {
    const newGroup = e.target.value;
    setGroup(newGroup);
    // Reset gerarchia geo per contestualizzare sul group
    setContinent(""); setCountry(""); setLocation("");
    try {
      const [cts, cys, locs, grs] = await Promise.all([
        getOptions("continents", { group: newGroup || undefined, year_start: ys, year_end: ye }),
        getOptions("countries",  { group: newGroup || undefined, year_start: ys, year_end: ye }),
        getOptions("locations",  { group: newGroup || undefined, year_start: ys, year_end: ye }),
        getOptions("groups",     { lang: (lang || "it").toUpperCase(), group: newGroup || undefined, year_start: ys, year_end: ye }),
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
        getOptions("countries", { continent: newCont || undefined, group: group || undefined, year_start: ys, year_end: ye }),
        getOptions("locations", { continent: newCont || undefined, group: group || undefined, year_start: ys, year_end: ye }),
        getOptions("groups",    { lang: (lang || "it").toUpperCase(), continent: newCont || undefined, year_start: ys, year_end: ye }),
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
        getOptions("locations", { continent: continent || undefined, country: newCty || undefined, group: group || undefined, year_start: ys, year_end: ye }),
        getOptions("groups",    { lang: (lang || "it").toUpperCase(), continent: continent || undefined, country: newCty || undefined, year_start: ys, year_end: ye }),
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
        year_start: ys, year_end: ye,
      });
      setGroups(grs || []);
    } catch (err) { console.error(err); }
    notify("location");
  };

  const handleSearchChange = (e) => { setQ(e.target.value); notify("q"); };

  const handleReset = async () => {
    const baseLang = (process.env.NEXT_PUBLIC_LANG || "it").toLowerCase();
    setLang(baseLang); setQ(""); setGroup(""); setContinent(""); setCountry(""); setLocation("");
    try {
      const [cts, grs] = await Promise.all([
        getOptions("continents", { year_start: ys, year_end: ye }),
        getOptions("groups",     { lang: baseLang.toUpperCase(), year_start: ys, year_end: ye }),
      ]);
      setContinents(cts || []); setCountries([]); setLocations([]); setGroups(grs || []);
    } catch (err) { console.error(err); }
    onFiltersChanged?.("reset");
  };

  return (
    <div className="gh-filters">
      <select value={lang} onChange={handleLangChange}>
        <option value="it">Italian</option>
        <option value="en">English</option>
      </select>

      <input type="text" placeholder="Search..." value={q} onChange={handleSearchChange} />

      {/* Group Event - PRIMO */}
      <select value={group} onChange={handleGroupChange}>
        <option value="">All Group Events</option>
        {groups.map(g => (
          <option key={g.value} value={g.value}>
            {g.label || g.value}{typeof g.count==="number" ? ` (${g.count})` : ""}
          </option>
        ))}
      </select>

      {/* Continent */}
      <select value={continent} onChange={handleContinentChange}>
        <option value="">All Continents</option>
        {continents.map(c => (
          <option key={c.value} value={c.value}>
            {c.label || c.value}{typeof c.count==="number" ? ` (${c.count})` : ""}
          </option>
        ))}
      </select>

      {/* Country */}
      <select value={country} onChange={handleCountryChange} disabled={!continent && !group}>
        <option value="">All Countries</option>
        {countries.map(c => (
          <option key={c.value} value={c.value}>
            {c.label || c.value}{typeof c.count==="number" ? ` (${c.count})` : ""}
          </option>
        ))}
      </select>

      {/* Location */}
      <select value={location} onChange={handleLocationChange} disabled={(!continent && !group) || (!!continent && !country)}>
        <option value="">All Locations</option>
        {locations.map(l => (
          <option key={l.value} value={l.value}>
            {l.label || l.value}{typeof l.count==="number" ? ` (${l.count})` : ""}
          </option>
        ))}
      </select>

      <button onClick={handleReset}>Reset</button>
    </div>
  );
}
