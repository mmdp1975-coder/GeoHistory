// src/components/TimelineSlider.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* utils */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// livelli: 0=1000y, 1=100y, 2=10y, 3=1y
const stepForLevel = (level) => (level === 0 ? 1000 : level === 1 ? 100 : level === 2 ? 10 : 1);
const levelForSpan = (span) => (span >= 4000 ? 0 : span >= 400 ? 1 : span >= 80 ? 2 : 3);
const fmt = (y) => (y < 0 ? `${Math.abs(y)} a.C.` : `${y} d.C.`);

/**
 * Props:
 * - min, max
 * - start, end
 * - onChange(s,e)
 * - onWiden?(side) → espande i bounds mantenendo il range (side: 'left'|'right'|null)
 * - compact
 */
export default function TimelineSlider({ min, max, start, end, onChange, onWiden, compact = false }) {
  const trackRef = useRef(null);
  const [level, setLevel] = useState(levelForSpan(Math.max(1, end - start)));
  useEffect(() => setLevel(levelForSpan(Math.max(1, end - start))), [start, end]);

  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  const tickEvery = stepForLevel(level);

  const ticks = useMemo(() => {
    const first = Math.floor(min / tickEvery) * tickEvery;
    const arr = [];
    for (let t = first; t <= max; t += tickEvery) arr.push(t);
    return arr;
  }, [min, max, tickEvery]);

  const pct = useCallback((v) => (100 * (v - min)) / (max - min), [min, max]);
  const valFromX = useCallback((clientX) => {
    if (!trackRef.current) return null;
    const r = trackRef.current.getBoundingClientRect();
    const p = clamp((clientX - r.left) / r.width, 0, 1);
    const raw = min + p * (max - min);
    const st = stepForLevel(level);
    return Math.round(raw / st) * st;
  }, [min, max, level]);

  /* drag */
  const dragging = useRef(null); // 'start' | 'end' | 'move' | null
  const [draggingSide, setDraggingSide] = useState(null);

  const nearerHandle = (clientX) => {
    const sx = pct(start), ex = pct(end);
    const r = trackRef.current.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 100;
    return Math.abs(x - sx) <= Math.abs(x - ex) ? "start" : "end";
  };

  const maybeAutoWiden = useCallback((s, e) => {
    if (typeof onWiden !== "function") return;
    const leftGap  = (s - min) / (max - min);
    const rightGap = (max - e) / (max - min);
    if (leftGap < 0.12)  onWiden("left");
    if (rightGap < 0.12) onWiden("right");
  }, [min, max, onWiden]);

  const beginDrag = (clientX, mode = null) => {
    const side = mode || nearerHandle(clientX);
    dragging.current = side;
    setDraggingSide(side);
    handleAt(clientX, side);
  };

  const handleAt = (clientX, which) => {
    const val = valFromX(clientX); if (val == null) return;
    const st = stepForLevel(level);
    if (which === "start") {
      const s = Math.min(Math.max(val, min), end);
      const e = Math.max(s + st, end);
      onChange?.(s, e);
      maybeAutoWiden(s, e);
    } else if (which === "end") {
      const e = Math.max(Math.min(val, max), start);
      const s = Math.min(e - st, start);
      onChange?.(s, e);
      maybeAutoWiden(s, e);
    } else {
      // SHIFT + drag → pan dell’intervallo
      const mid = (start + end) / 2;
      const dx = val - mid;
      let s = start + dx, e = end + dx;
      if (s < min) { e += (min - s); s = min; }
      if (e > max) { s -= (e - max); e = max; }
      const q = (x) => Math.round(x / st) * st;
      s = q(s); e = q(e); if (e <= s) e = s + st;
      onChange?.(s, e);
      maybeAutoWiden(s, e);
    }
  };

  useEffect(() => {
    const mm = (ev) => { if (dragging.current) handleAt(ev.clientX, dragging.current); };
    const mu = () => { dragging.current = null; setDraggingSide(null); };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [handleAt]);

  useEffect(() => {
    const tm = (ev) => { if (!dragging.current) return; const t = ev.touches[0]; if (t) handleAt(t.clientX, dragging.current); };
    const te = () => { dragging.current = null; setDraggingSide(null); };
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", te);
    return () => { window.removeEventListener("touchmove", tm); window.removeEventListener("touchend", te); };
  }, [handleAt]);

  /* Allarga DOMINIO (bottoni < >) mantenendo il range */
  const widenLeft  = () => { if (typeof onWiden === "function") onWiden("left");  };
  const widenRight = () => { if (typeof onWiden === "function") onWiden("right"); };

  const onWheel = (e) => { e.preventDefault(); if (e.deltaY > 0) widenRight(); else widenLeft(); };
  const onKey = (e) => {
    const st = stepForLevel(level);
    if (e.key === "ArrowRight") {
      const width = end - start;
      const s2 = Math.min(Math.max(start + st, min), max - width);
      const e2 = Math.min(s2 + width, max);
      onChange?.(s2, e2);
      e.preventDefault();
      maybeAutoWiden(s2, e2);
    } else if (e.key === "ArrowLeft") {
      const width = end - start;
      const s2 = Math.max(Math.min(start - st, max - st), min);
      const e2 = Math.min(s2 + width, max);
      onChange?.(s2, e2);
      e.preventDefault();
      maybeAutoWiden(s2, e2);
    } else if (e.key === "+") { widenRight(); e.preventDefault(); }
  };

  /* UI sizes */
  const trackH = compact ? 38 : 46;
  const fillH  = 3;            // linea blu molto sottile
  const dot    = compact ? 20 : 20;

  const moving = draggingSide !== null;

  return (
    <div className={`tl ${ready ? "ready" : ""}`} onWheel={onWheel}>
      {/* SINISTRA: chevron moderno */}
      <button className="zm" aria-label="Expand timeline (left)" title="Expand timeline" onClick={widenLeft}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div
        className="track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={start}
        onKeyDown={onKey}
        onMouseDown={(e) => beginDrag(e.clientX, e.shiftKey ? "move" : null)}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) beginDrag(t.clientX, null); }}
        style={{ height: `${trackH}px` }}
      >
        <div
          className={`fill ${moving ? "moving" : ""} ${draggingSide ? `side-${draggingSide}` : ""}`}
          style={{
            left: `${(100*(start-min))/(max-min)}%`,
            width: `${(100*(end-start))/(max-min)}%`,
            height: `${fillH}px`,
            top: `calc(50% - ${fillH/2}px)`
          }}
        />
        <button
          className={`hdl ${draggingSide === "start" ? "active" : ""}`}
          style={{ left: `${(100*(start-min))/(max-min)}%`, width: `${dot}px`, height: `${dot}px` }}
          aria-label="Start"
          onMouseDown={(e) => { e.stopPropagation(); beginDrag(e.clientX, "start"); }}
          onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) beginDrag(t.clientX, "start"); }}
        />
        <button
          className={`hdl ${draggingSide === "end" ? "active" : ""}`}
          style={{ left: `${(100*(end-min))/(max-min)}%`, width: `${dot}px`, height: `${dot}px` }}
          aria-label="End"
          onMouseDown={(e) => { e.stopPropagation(); beginDrag(e.clientX, "end"); }}
          onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) beginDrag(t.clientX, "end"); }}
        />

        <div className="ticks">
          {ticks.map((t) => {
            const p = (100 * (t - min)) / (max - min);
            const major = level >= 3 ? (t % (tickEvery * 5) === 0) :
                           level === 2 ? (t % 100 === 0) :
                           level === 1 ? (t % 500 === 0) : true;
            return (
              <div key={t} className={`tick ${major ? "maj" : "min"}`} style={{ left: `${p}%` }}>
                {!compact && major && <span className="lbl">{fmt(t)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* DESTRA: chevron moderno */}
      <button className="zm" aria-label="Expand timeline (right)" title="Expand timeline" onClick={widenRight}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <style jsx>{`
        .tl { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; gap: 8px; min-width: 0; visibility: hidden; }
        .tl.ready { visibility: visible; }

        .zm {
          height: 30px; width: 40px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff;
          font-size: 18px; font-weight: 800; cursor: pointer; color:#111827;
        }
        .track {
          position: relative; min-height: 38px; display: flex; align-items: center; user-select: none; outline: none; overflow: hidden;
        }
        .track::before { content:""; position:absolute; left:0; right:0; top:50%; height:3px; transform:translateY(-50%); background:#e5e7eb; border-radius:999px; }
        .fill {
          position:absolute; border-radius:999px; background:#3b82f6;
          transition: box-shadow 120ms ease, transform 120ms ease, background 120ms ease;
        }
        .fill.moving { box-shadow: 0 0 0 2px rgba(59,130,246,0.18), 0 0 0 1px #3b82f6 inset; }
        .fill.moving.side-start { transform-origin: left center; }
        .fill.moving.side-end { transform-origin: right center; }

        .hdl {
          position:absolute; top:50%; transform:translate(-50%,-50%);
          border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,0.25);
          background:#111827; cursor:grab; touch-action:none; transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
        }
        .hdl.active { transform: translate(-50%,-50%) scale(1.15); box-shadow: 0 0 0 3px rgba(17,24,39,0.18); background:#0f172a; }

        .ticks { position:absolute; inset:0; pointer-events:none; }
        .tick { position:absolute; bottom:0; width:1px; background:#cbd5e1; height:10px; transform:translateX(-0.5px); }
        .tick.maj { height:14px; background:#94a3b8; }
        /* Etichette leggibili sopra la timeline */
        .lbl {
          position:absolute; top:-24px; transform:translateX(-50%);
          font-size:11px; color:#374151; white-space:nowrap; z-index:2;
          background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:1px 6px;
          box-shadow:0 1px 2px rgba(0,0,0,0.04);
        }
      `}</style>
    </div>
  );
}
