"use client";

// [MVP-03 FIX] Tour controls con gestione START vs RESUME
import { useEffect } from "react";
import { narrator } from "../lib/audio";
import type { GeoEvent } from "../types/event";

type Props = {
  lang: "it" | "en";
  isPlaying: boolean;
  selectedEvent: GeoEvent | null;
  hasResults: boolean;

  // Segnali per distinguere azioni
  resumeSignal: number; // quando aumenta -> resume() senza risintetizzare
  speakSignal: number;  // quando aumenta -> speak() del selectedEvent

  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export default function TourControls({
  lang,
  isPlaying,
  selectedEvent,
  hasResults,
  resumeSignal,
  speakSignal,
  onPlay,
  onPause,
  onPrev,
  onNext,
}: Props) {

  // Resume: riprende esattamente da dove era stato messo in pausa
  useEffect(() => {
    if (!isPlaying) return;
    narrator.resume();
  }, [resumeSignal, isPlaying]);

  // Speak: nuovo speak (start/next/prev/nuovo evento selezionato durante play)
  useEffect(() => {
    if (!isPlaying || !selectedEvent) return;
    narrator.speakForEvent(selectedEvent, lang);
  }, [speakSignal, selectedEvent, lang, isPlaying]);

  // Se esce dalla modalità play, metto in pausa la voce
  useEffect(() => {
    if (!isPlaying) narrator.pause();
  }, [isPlaying]);

  // Pulizia
  useEffect(() => () => narrator.stop(), []);

  return (
    <div className="gh-readerbar" role="toolbar" aria-label="Tour controls">
      <button title="Previous" aria-label="Previous" onClick={onPrev} disabled={!hasResults}>⏮</button>
      <button title="Play"     aria-label="Play"    onClick={onPlay} disabled={!hasResults}>▶</button>
      <button title="Pause"    aria-label="Pause"   onClick={onPause} disabled={!hasResults}>⏸</button>
      <button title="Next"     aria-label="Next"    onClick={onNext} disabled={!hasResults}>⏭</button>
    </div>
  );
}
