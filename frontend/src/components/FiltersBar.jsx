"use client";

import { useEffect, useMemo, useState } from "react";
import { getOptions } from "../lib/api";

export default function FiltersBar({
  lang, setLang,
  q, setQ,
  continent, setContinent,
  country, setCountry,
  location, setLocation,
  group, setGroup,
  onFiltersChanged
}) {
  const [continents, setContinents] = useState([]);
  const [countries, setCountries]   = useState([]);
  const [locations, setLocations]   = useState([]);
  const [groups, setGroups]         = useState([]);

  // carica continenti iniziali
  useEffect(() => {
    getOptions("continents").then(setContinents).catch(console.error);
  }, []);

  // aggiorna paesi quando cambia continente
  useEffect(() => {
    getOptions("countries", { continent }).then(setCountries).catch(console.error);
    setCountry("");
    setLocation("");
  }, [continent]);

  // aggiorna location quando cambia paese
  useEffect(() => {
    getOptions("locations", { continent, country }).then(setLocations).catch(console.error);
    setLocation("");
  }, [continent, country]);

  // aggiorna groups (dipende da hierarchia e lingua)
  useEffect(() => {
    getOptions("groups", { lang: lang.toUpperCase(), continent, country, location }).then(setGroups).catch(console.error);
  }, [lang, continent, country, location]);

  // auto-notifica cambi filtri (page.js deciderà se applicare)
  useEffect(() => {
    onFiltersChanged?.();
  }, [lang, q, continent, country, location, group, onFiltersChanged]);

  return (
    <div className="toolbar">
      <select value={lang} onChange={(e)=>setLang(e.target.value)}>
        <option value="it">Italian</option>
        <option value="en">English</option>
      </select>

      <input
        type="text"
        placeholder="Search..."
        value={q}
        onChange={(e)=>setQ(e.target.value)}
        style={{ minWidth: 220 }}
      />

      <select value={continent} onChange={(e)=>setContinent(e.target.value)}>
        <option value="">All Continents</option>
        {continents.map(c => <option key={c.value} value={c.value}>{c.value} <span className="badge">({c.count})</span></option>)}
      </select>

      <select value={country} onChange={(e)=>setCountry(e.target.value)}>
        <option value="">All Countries</option>
        {countries.map(c => <option key={c.value} value={c.value}>{c.value} <span className="badge">({c.count})</span></option>)}
      </select>

      <select value={location} onChange={(e)=>setLocation(e.target.value)}>
        <option value="">All Locations</option>
        {locations.map(l => <option key={l.value} value={l.value}>{l.value} <span className="badge">({l.count})</span></option>)}
      </select>

      <select value={group} onChange={(e)=>setGroup(e.target.value)}>
        <option value="">All Events</option>
        {groups.map(g => <option key={g.value} value={g.value}>{g.value}</option>)}
      </select>

      <button onClick={()=>onFiltersChanged?.("reset")}>Reset</button>
    </div>
  );
}
