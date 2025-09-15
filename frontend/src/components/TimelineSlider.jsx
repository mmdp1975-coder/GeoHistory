// src/components/TimelineSlider.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* utils */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stepForLevel = (level) => (level === 0 ? 1000 : level === 1 ? 100 : 10); // millenni, secoli, decenni
const levelForSpan = (span) => (span >= 4000 ? 0 : span >= 400 ? 1 : 2);
const fmt = (y) => (y < 0 ? `${Math.abs(y)} a.C.` : `${y} d.C.`);

export default function TimelineSlider({ min, max, start, end, onChange, compact = false }) {
  const trackRef = useRef(null);
  const [level, setLevel] = useState(levelForSpan(Math.max(1, end - start)));
  useEffect(() => setLevel(levelForSpan(Math.max(1, end - start))), [start, end]);

  // anti-flash: nascondi finché non è montato
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  const tickEvery = stepForLevel(level);
  const ticks = useMemo(() => {
    const first = Math.floor(min / tickEvery) * tickEvery;
    const arr = []; for (let t = first; t <= max; t += tickEvery) arr.push(t);
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
  const dragging = useRef(null); // "start" | "end" | "move"
  const nearerHandle = (clientX) => {
    const sx = pct(start), ex = pct(end);
    const r = trackRef.current.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 100;
    return Math.abs(x - sx) <= Math.abs(x - ex) ? "start" : "end";
  };
  const beginDrag = (clientX, mode = null) => { dragging.current = mode || nearerHandle(clientX); handleAt(clientX, dragging.current); };
  const handleAt = (clientX, which) => {
    const val = valFromX(clientX); if (val == null) return;
    const st = stepForLevel(level);
    if (which === "start") {
      const s = clamp(val, min, end);
      const e = Math.max(s + st, end);
      onChange?.(s, e);
    } else if (which === "end") {
      const e = clamp(val, start, max);
      const s = Math.min(e - st, start);
      onChange?.(s, e);
    } else {
      const mid = (start + end) / 2;
      const dx = val - mid;
      let s = start + dx, e = end + dx;
      if (s < min) { e += (min - s); s = min; }
      if (e > max) { s -= (e - max); e = max; }
      const q = (x) => Math.round(x / st) * st;
      s = q(s); e = q(e); if (e <= s) e = s + st;
      onChange?.(s, e);
    }
  };
  useEffect(() => {
    const mm = (ev) => { if (dragging.current) handleAt(ev.clientX, dragging.current); };
    const mu = () => { dragging.current = null; };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [handleAt]);
  useEffect(() => {
    const tm = (ev) => { if (!dragging.current) return; const t = ev.touches[0]; if (t) handleAt(t.clientX, dragging.current); };
    const te = () => { dragging.current = null; };
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", te);
    return () => { window.removeEventListener("touchmove", tm); window.removeEventListener("touchend", te); };
  }, [handleAt]);

  /* zoom */
  const zoom = (dir, pivot = (start + end) / 2) => {
    const st = stepForLevel(level);
    const next = clamp(level + dir, 0, 2);
    if (next === level) return;
    const factor = dir > 0 ? 0.5 : 2;
    const half = ((end - start) / 2) * factor;
    let s = Math.round((pivot - half) / st) * st;
    let e = Math.round((pivot + half) / st) * st;
    if (e <= s) e = s + st;
    onChange?.(clamp(s, min, max), clamp(e, min, max));
  };
  const onWheel = (e) => {
    if (!trackRef.current) return;
    e.preventDefault();
    const r = trackRef.current.getBoundingClientRect();
    const pivotVal = valFromX(e.clientX ?? (r.left + r.width / 2));
    e.deltaY < 0 ? zoom(+1, pivotVal ?? ((start + end) / 2)) : zoom(-1, pivotVal ?? ((start + end) / 2));
  };
  const onKey = (e) => {
    const st = stepForLevel(level);
    if (e.key === "ArrowRight") {
      if (e.shiftKey) onChange?.(start, clamp(end + st, start + st, max));
      else if (e.altKey) onChange?.(clamp(start + st, min, end - st), end);
      else {
        const s2 = clamp(start + st, min, max - st);
        const e2 = clamp(end + st, s2 + st, max);
        onChange?.(s2, e2);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      if (e.shiftKey) onChange?.(start, clamp(end - st, start + st, max));
      else if (e.altKey) onChange?.(clamp(start - st, min, end - st), end);
      else {
        const e2 = clamp(end - st, min + st, max);
        const s2 = clamp(start - st, min, e2 - st);
        onChange?.(s2, e2);
      }
      e.preventDefault();
    }
  };

  /* UI sizes */
  const trackH = compact ? 52 : 56;
  const fillH  = compact ? 14 : (level === 0 ? 12 : level === 1 ? 14 : 18);
  const dot    = compact ? 26 : 24;

  /* pan bar solo desktop */
  const showPan = !compact;
  const scrollRef = useRef(null);
  const dragPan = useRef(false);
  const winW = Math.max(1, end - start);
  const domW = Math.max(1, max - min);
  const thumbLeft = (start - min) / domW * 100;
  const thumbW = winW / domW * 100;
  const panTo = (clientX) => {
    if (!scrollRef.current) return;
    const r = scrollRef.current.getBoundingClientRect();
    const p = clamp((clientX - r.left) / r.width, 0, 1);
    const raw = min + p * (max - min) - winW * 0.5;
    const s = clamp(raw, min, max - winW), e = s + winW;
    const st = stepForLevel(level);
    const q = (x) => Math.round(x / st) * st;
    let S = q(s), E = q(e); if (E <= S) E = S + st;
    onChange?.(S, E);
  };
  useEffect(() => {
    if (!showPan) return;
    const mm = (ev) => { if (dragPan.current) panTo(ev.clientX); };
    const mu = () => { dragPan.current = false; };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [showPan, min, max, start, end, level]);

  return (
    <div className={`tl ${ready ? "ready" : ""}`} onWheel={onWheel}>
      <button className="zm" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(-1)}>−</button>

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
          className="fill"
          style={{
            left: `${(100*(start-min))/(max-min)}%`,
            width: `${(100*(end-start))/(max-min)}%`,
            height: `${fillH}px`,
            top: `calc(50% - ${fillH/2}px)`
          }}
        />
        <button
          className="hdl"
          style={{ left: `${(100*(start-min))/(max-min)}%`, width: `${dot}px`, height: `${dot}px` }}
          aria-label="Start"
          onMouseDown={(e) => { e.stopPropagation(); beginDrag(e.clientX, "start"); }}
          onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) beginDrag(t.clientX, "start"); }}
        />
        <button
          className="hdl"
          style={{ left: `${(100*(end-min))/(max-min)}%`, width: `${dot}px`, height: `${dot}px` }}
          aria-label="End"
          onMouseDown={(e) => { e.stopPropagation(); beginDrag(e.clientX, "end"); }}
          onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) beginDrag(t.clientX, "end"); }}
        />

        <div className="ticks">
          {ticks.map((t) => {
            const p = (100 * (t - min)) / (max - min);
            const major = (level === 0) || (level === 1 ? (t % 500 === 0) : (t % 100 === 0));
            return (
              <div key={t} className={`tick ${major ? "maj" : "min"}`} style={{ left: `${p}%` }}>
                {!compact && major && <span className="lbl">{fmt(t)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <button className="zm" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(+1)}>+</button>

      {showPan && (
        <div className="pan">
          <button className="pb" onClick={() => onChange?.(clamp(start - stepForLevel(level), min, max - winW), clamp(end - stepForLevel(level), min + winW, max))}>«</button>
          <div className="ptr" ref={scrollRef} onMouseDown={(e) => { panTo(e.clientX); dragPan.current = true; }}>
            <div className="pth" style={{ left: `${thumbLeft}%`, width: `${thumbW}%` }} onMouseDown={(e)=>{e.stopPropagation(); dragPan.current=true;}} />
          </div>
          <button className="pb" onClick={() => onChange?.(clamp(start + stepForLevel(level), min, max - winW), clamp(end + stepForLevel(level), min + winW, max))}>»</button>
        </div>
      )}

      <style jsx>{`
        .tl { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; gap: 8px; min-width: 0; visibility: hidden; }
        .tl.ready { visibility: visible; } /* anti-flash */

        .zm {
          height: 40px; width: 40px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; font-size: 18px; font-weight: 700; cursor: pointer;
        }
        .track {
          position: relative; min-height: 52px; display: flex; align-items: center; user-select: none; outline: none; overflow: hidden;
        }
        .track::before { content:""; position:absolute; left:0; right:0; top:50%; height:8px; transform:translateY(-50%); background:#e5e7eb; border-radius:999px; }
        .fill { position:absolute; border-radius:999px; background:#3b82f6; }
        .hdl { position:absolute; top:50%; transform:translate(-50%,-50%); border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,.2); background:#111827; cursor:grab; touch-action:none; }
        .ticks { position:absolute; inset:0; pointer-events:none; }
        .tick { position:absolute; bottom:0; width:1px; background:#cbd5e1; height:14px; transform:translateX(-0.5px); }
        .tick.maj { background:#94a3b8; height:20px; }
        .tick .lbl { position:absolute; bottom:22px; transform:translate(-50%,0); font-size:11px; color:#6b7280; background:rgba(255,255,255,.85); padding:0 4px; border-radius:6px; white-space:nowrap; }

        .pan { grid-column:1 / -1; display:grid; grid-template-columns: 40px 1fr 40px; align-items:center; gap:8px; margin-top:6px; }
        .pb  { height:32px; width:40px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; font-weight:700; cursor:pointer; }
        .ptr { position:relative; height:10px; border-radius:999px; background:#e5e7eb; overflow:hidden; cursor:pointer; }
        .pth { position:absolute; top:0; bottom:0; background:#93c5fd; border:1px solid #3b82f6; border-radius:999px; cursor:grab; touch-action:none; }

        /* --- MOBILE TWEAKS --- */
        @media (max-width: 768px) {
          .tl { gap: 6px; }
          .zm { height: 38px; width: 38px; }
          .track { min-height: 56px; }
          .tick .lbl { font-size: 10px; bottom: 20px; }
        }
      `}</style>
    </div>
  );
}

