"use client";

export default function DetailsPanel({ event }) {
  return (
    <aside className="details">
      {!event ? (
        <em>Select an event to view details.</em>
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>{event.event}</h2>
          <p><strong>{event.group_event}</strong></p>
          <p>
            {(event.from_year ?? event.year_from ?? "")}
            {(event.to_year ?? event.year_to) && (event.to_year ?? event.year_to) !== (event.from_year ?? event.year_from)
              ? ` – ${event.to_year ?? event.year_to}`
              : ""}
          </p>
          {event.description && <p style={{ whiteSpace:"pre-wrap" }}>{event.description}</p>}
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
