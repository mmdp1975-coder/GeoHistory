// src/components/TimelineSlider.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** ====== Util ====== */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmtYear(y) {
  if (y === 0) return "0";
  if (y < 0) return `${Math.abs(y)} a.C.`;
  return `${y} d.C.`;
}
function stepForLevel(level) {
  // 0=millenni, 1=secoli, 2=decenni
  return level === 0 ? 1000 : level === 1 ? 100 : 10;
}
function levelForSpan(span) {
  if (span >= 4000) return 0; // millenni
  if (span >= 400)  return 1; // secoli
  return 2;                   // decenni
}

export default function TimelineSlider({
  min, max, start, end,
  onChange
}) {
  const trackRef = useRef(null);
  const [level, setLevel] = useState(levelForSpan((end - start) || (max - min)));
  const span = Math.max(1, end - start);

  // aggiorna livello quando cambia range
  useEffect(() => { setLevel(levelForSpan(span)); }, [span]);

  const tickEvery = stepForLevel(level);
  const ticks = useMemo(() => {
    const first = Math.floor(min / tickEvery) * tickEvery;
    const out = [];
    for (let t = first; t <= max; t += tickEvery) out.push(t);
    return out;
  }, [min, max, tickEvery]);

  const pct = useCallback((v) => (100 * (v - min)) / (max - min), [min, max]);
  const valFromClientX = useCallback((clientX) => {
    if (!trackRef.current) return null;
    const rect = trackRef.current.getBoundingClientRect();
    const p = clamp((clientX - rect.left) / rect.width, 0, 1);
    const raw = min + p * (max - min);
    const st = stepForLevel(level);
    return Math.round(raw / st) * st;
  }, [min, max, level]);

  /** Drag logica slider */
  const draggingRef = useRef(null); // "start" | "end" | "move"

  const decideHandle = (clientX) => {
    const sx = pct(start), ex = pct(end);
    const rect = trackRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const dS = Math.abs(x - sx);
    const dE = Math.abs(x - ex);
    return dS <= dE ? "start" : "end";
  };

  const beginDrag = (clientX, mode = null) => {
    draggingRef.current = mode || decideHandle(clientX);
    handleAt(clientX, draggingRef.current);
  };

  const handleAt = (clientX, which) => {
    const val = valFromClientX(clientX);
    if (val == null) return;
    const st = stepForLevel(level);

    if (which === "start") {
      const s = clamp(val, min, end);
      const e = Math.max(s + st, end);
      onChange?.(s, e);
    } else if (which === "end") {
      const e = clamp(val, start, max);
      const s = Math.min(e - st, start);
      onChange?.(s, e);
    } else { // move intero range
      const mid = (start + end) / 2;
      const dx = val - mid;
      let s = start + dx, e = end + dx;
      const w = end - start;
      if (s < min) { e += (min - s); s = min; }
      if (e > max) { s -= (e - max); e = max; }
      // quantizza agli step
      s = Math.round(s / st) * st;
      e = Math.round(e / st) * st;
      if (e <= s) e = s + st;
      onChange?.(s, e);
    }
  };

  // mouse
  useEffect(() => {
    const mm = (ev) => { if (draggingRef.current) handleAt(ev.clientX, draggingRef.current); };
    const mu = () => { draggingRef.current = null; };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [handleAt]);

  // touch
  useEffect(() => {
    const tm = (ev) => { if (!draggingRef.current) return; const t = ev.touches[0]; if (t) handleAt(t.clientX, draggingRef.current); };
    const te = () => { draggingRef.current = null; };
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", te);
    return () => { window.removeEventListener("touchmove", tm); window.removeEventListener("touchend", te); };
  }, [handleAt]);

  /** Zoom: bottoni e rotella */
  const zoom = (dir, pivot = (start + end) / 2) => {
    const st = stepForLevel(level);
    const nextLevel = clamp(level + dir, 0, 2);
    if (nextLevel === level) return;

    const factor = dir > 0 ? 0.5 : 2; // zoom in dimezza, zoom out raddoppia
    const half = ((end - start) / 2) * factor;
    let s = Math.round((pivot - half) / st) * st;
    let e = Math.round((pivot + half) / st) * st;
    if (e <= s) e = s + st;
    s = clamp(s, min, max);
    e = clamp(e, min, max);
    onChange?.(s, e);
  };

  const onWheel = (e) => {
    if (!trackRef.current) return;
    e.preventDefault();
    const rect = trackRef.current.getBoundingClientRect();
    const pivotVal = valFromClientX(e.clientX ?? (rect.left + rect.width / 2));
    if (e.deltaY < 0) zoom(+1, pivotVal ?? ((start + end) / 2));
    else zoom(-1, pivotVal ?? ((start + end) / 2));
  };

  /** Tastiera: ←/→ spostano finestra; Shift+freccia ridimensiona lato destro; Alt+freccia lato sinistro */
  const onKeyDown = (e) => {
    const st = stepForLevel(level);
    if (e.key === "ArrowRight") {
      if (e.shiftKey) { // allarga/accorcia lato destro
        const e2 = clamp(end + st, start + st, max);
        onChange?.(start, e2);
      } else if (e.altKey) { // muove solo inizio
        const s2 = clamp(start + st, min, end - st);
        onChange?.(s2, end);
      } else { // trasla
        const s2 = clamp(start + st, min, max - st);
        const e2 = clamp(end + st, s2 + st, max);
        onChange?.(s2, e2);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      if (e.shiftKey) {
        const e2 = clamp(end - st, start + st, max);
        onChange?.(start, e2);
      } else if (e.altKey) {
        const s2 = clamp(start - st, min, end - st);
        onChange?.(s2, end);
      } else {
        const e2 = clamp(end - st, min + st, max);
        const s2 = clamp(start - st, min, e2 - st);
        onChange?.(s2, e2);
      }
      e.preventDefault();
    }
  };

  // spessore/handle dinamici per dare “più presenza” ai range stretti
  const heightPx   = level === 0 ? 8 : level === 1 ? 10 : 14;
  const handleSize = level === 0 ? 16 : level === 1 ? 18 : 20;

  /** ===== Scrollbar per il pan orizzontale ===== */
  const scrollTrackRef = useRef(null);
  const scrollDragRef = useRef(false);
  const windowWidth = Math.max(1, end - start);
  const domainWidth = Math.max(1, max - min);
  const thumbLeftPct = (start - min) / domainWidth * 100;
  const thumbWidthPct = windowWidth / domainWidth * 100;

  const panToClientX = (clientX) => {
    if (!scrollTrackRef.current) return;
    const rect = scrollTrackRef.current.getBoundingClientRect();
    const p = clamp((clientX - rect.left) / rect.width, 0, 1);
    const newStartRaw = min + p * (max - min) - windowWidth * 0.5;
    let s = clamp(newStartRaw, min, max - windowWidth);
    let e = s + windowWidth;
    // quantizza allo step corrente per coerenza
    const st = stepForLevel(level);
    s = Math.round(s / st) * st;
    e = Math.round(e / st) * st;
    if (e <= s) e = s + st;
    onChange?.(s, e);
  };

  // click sulla barra → centra lì il range
  const onScrollTrackDown = (e) => {
    panToClientX(e.clientX);
    scrollDragRef.current = true;
  };
  // drag del thumb
  const onScrollThumbDown = (e) => {
    e.stopPropagation();
    scrollDragRef.current = true;
  };

  useEffect(() => {
    const mm = (ev) => { if (scrollDragRef.current) panToClientX(ev.clientX); };
    const mu = () => { scrollDragRef.current = false; };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [min, max, start, end, level]);

  // bottoni « » per piccoli pan a step
  const step = stepForLevel(level);
  const panLeft  = () => onChange?.(clamp(start - step, min, max - windowWidth), clamp(end - step, min + windowWidth, max));
  const panRight = () => onChange?.(clamp(start + step, min, max - windowWidth), clamp(end + step, min + windowWidth, max));

  return (
    <div className="tl-wrap" onWheel={onWheel}>
      <button className="zoom" aria-label="Zoom out" title="Zoom out (millenni ↔ secoli ↔ decenni)" onClick={() => zoom(-1)}>−</button>

      <div
        className="track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={start}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => beginDrag(e.clientX, e.shiftKey ? "move" : null)}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) beginDrag(t.clientX, null); }}
      >
        {/* riempimento selezione */}
        <div
          className="fill"
          style={{
            left: `${(100*(start-min))/(max-min)}%`,
            width: `${(100*(end-start))/(max-min)}%`,
            height: `${heightPx}px`,
            top: `calc(50% - ${heightPx/2}px)`
          }}
        />

        {/* handle start */}
        <button
          className="handle"
          style={{
            left: `${(100*(start-min))/(max-min)}%`,
            width: `${handleSize}px`,
            height: `${handleSize}px`
          }}
          aria-label="Start year"
          onMouseDown={(e) => { e.stopPropagation(); beginDrag(e.clientX, "start"); }}
          onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) beginDrag(t.clientX, "start"); }}
        />
        {/* handle end */}
        <button
          className="handle"
          style={{
            left: `${(100*(end-min))/(max-min)}%`,
            width: `${handleSize}px`,
            height: `${handleSize}px`
          }}
          aria-label="End year"
          onMouseDown={(e) => { e.stopPropagation(); beginDrag(e.clientX, "end"); }}
          onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) beginDrag(t.clientX, "end"); }}
        />

        {/* ticks */}
        <div className="ticks">
          {ticks.map((t) => {
            const p = (100 * (t - min)) / (max - min);
            const major = (level === 0) || (level === 1 ? (t % 500 === 0) : (t % 100 === 0));
            return (
              <div key={t} className={`tick ${major ? "major" : "minor"}`} style={{ left: `${p}%` }}>
                {major && <span className="lbl">{fmtYear(t)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <button className="zoom" aria-label="Zoom in" title="Zoom in (millenni ↔ secoli ↔ decenni)" onClick={() => zoom(+1)}>+</button>

      {/* ===== Scrollbar/Pan bar ===== */}
      <div className="pan-row">
        <button className="pan-btn" title="Pan a sinistra" aria-label="Pan left" onClick={panLeft}>«</button>
        <div className="pan-track" ref={scrollTrackRef} onMouseDown={onScrollTrackDown}>
          <div
            className="pan-thumb"
            style={{ left: `${thumbLeftPct}%`, width: `${thumbWidthPct}%` }}
            onMouseDown={onScrollThumbDown}
          />
        </div>
        <button className="pan-btn" title="Pan a destra" aria-label="Pan right" onClick={panRight}>»</button>
      </div>

      <style jsx>{`
        .tl-wrap {
          display: grid;
          grid-template-columns: 40px 1fr 40px;
          align-items: center;
          gap: 8px;
          min-width: 0;     /* evita overflow */
        }
        .zoom {
          height: 40px; width: 40px;
          border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; font-size: 18px; font-weight: 700;
          cursor: pointer;
        }
        .track {
          position: relative;
          height: 42px;
          display: flex;
          align-items: center;
          background: transparent;
          cursor: default;
          user-select: none;
          outline: none;
          min-width: 0;
          overflow: hidden;     /* blocca elementi che escono ai lati */
        }
        .track::before {
          content: "";
          display: block;
          position: absolute; left: 0; right: 0; top: 50%;
          height: 8px; transform: translateY(-50%);
          background: #e5e7eb; border-radius: 999px;
        }
        .fill {
          position: absolute; border-radius: 999px; background: #3b82f6;
        }
        .handle {
          position: absolute; top: 50%; transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.2);
          background: #111827; cursor: grab;
        }
        .ticks { position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none; }
        .tick {
          position: absolute; bottom: 0; width: 1px; background: #cbd5e1; height: 14px; transform: translateX(-0.5px);
        }
        .tick.major { background: #94a3b8; height: 20px; }
        .tick .lbl {
          position: absolute; bottom: 20px; transform: translate(-50%, 0);
          font-size: 11px; color: #6b7280; white-space: nowrap;
          background: rgba(255,255,255,.85); padding: 0 4px; border-radius: 6px;
        }

        /* ===== Scrollbar/Pan bar ===== */
        .pan-row {
          grid-column: 1 / -1; /* occupa tutta la riga sotto lo slider */
          display: grid;
          grid-template-columns: 40px 1fr 40px;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }
        .pan-btn {
          height: 28px; width: 40px;
          border: 1px solid #e5e7eb; border-radius: 8px; background: #fff;
          font-weight: 700; cursor: pointer;
        }
        .pan-track {
          position: relative;
          height: 10px; border-radius: 999px; background: #e5e7eb;
          overflow: hidden; cursor: pointer;
        }
        .pan-thumb {
          position: absolute; top: 0; bottom: 0;
          background: #93c5fd; border: 1px solid #3b82f6;
          border-radius: 999px; cursor: grab;
        }
      `}</style>
    </div>
  );
}
