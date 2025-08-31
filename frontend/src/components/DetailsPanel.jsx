"use client";

export default function DetailsPanel({ event, onPrev, onPlay, onPause, onNext }) {
  return (
    <aside className="details">
      <div className="reader-controls">
        <button className="reader-btn" title="Previous" aria-label="Previous" onClick={onPrev}>⏮</button>
        <button className="reader-btn" title="Play"     aria-label="Play"    onClick={onPlay}>▶</button>
        <button className="reader-btn" title="Pause"    aria-label="Pause"   onClick={onPause}>⏸</button>
        <button className="reader-btn" title="Next"     aria-label="Next"    onClick={onNext}>⏭</button>
      </div>

      {!event ? (
        <em>Select an event or use the controls.</em>
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>{event.event}</h2>
          <p><strong>{event.group_event}</strong></p>
          <p>
            {(event.from_year ?? "")}
            {event.to_year && event.to_year !== event.from_year ? ` – ${event.to_year}` : ""}
          </p>
          {event.description && <p>{event.description}</p>}
          {event.wikipedia && (
            <p>
              <a href={event.wikipedia} target="_blank" rel="noreferrer">Wikipedia</a>
            </p>
          )}
          <p style={{ color:"#666" }}>
            {event.continent} · {event.country} · {event.location}
          </p>
        </>
      )}
    </aside>
  );
}
