// [MVP-03 FIX] Narratore TTS con Web Speech API (IT/EN)
// Migliorato: pausa/ripresa reale della stessa frase senza ripartire da capo.

export type LangCode = "it" | "en";

class Narrator {
  private utter?: SpeechSynthesisUtterance | null;
  private readyVoices: SpeechSynthesisVoice[] = [];
  private voicesLoaded = false;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const load = () => {
          this.readyVoices = window.speechSynthesis.getVoices() || [];
          this.voicesLoaded = true;
        };
        load();
        window.speechSynthesis.onvoiceschanged = () => load();
      } catch {
        /* no-op */
      }
    }
  }

  private pickVoice(lang: LangCode): SpeechSynthesisVoice | undefined {
    if (!this.voicesLoaded) this.readyVoices = (window.speechSynthesis.getVoices?.() || []);
    const want = lang === "it" ? "it" : "en";
    const v =
      this.readyVoices.find(v => v.lang?.toLowerCase().startsWith(`${want}-`)) ||
      this.readyVoices.find(v => v.lang?.toLowerCase().startsWith(want)) ||
      this.readyVoices[0];
    return v;
  }

  stop() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      this.utter = null;
    } catch { /* no-op */ }
  }

  pause() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.pause();
    } catch { /* no-op */ }
  }

  resume() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      // Se esiste una utterance in corso e il motore è in pausa, riprendo dal punto esatto
      window.speechSynthesis.resume();
    } catch { /* no-op */ }
  }

  isSpeaking(): boolean {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    return window.speechSynthesis.speaking;
  }

  speak(text: string, lang: LangCode) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!text || !text.trim()) return;
    try {
      this.stop(); // azzera eventuale coda precedente (nuovo evento/next/prev)
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pickVoice(lang);
      if (v) u.voice = v;
      u.lang = (lang === "it" ? "it-IT" : "en-US");
      u.rate = 1;
      u.pitch = 1;
      u.volume = 1;
      this.utter = u;
      window.speechSynthesis.speak(u);
    } catch { /* no-op */ }
  }

  speakForEvent(event: any, lang: LangCode) {
    if (!event) return;
    const L = (lang || "it").toLowerCase() as LangCode;
    const parts: string[] = [];
    if (event.description && typeof event.description === "string") parts.push(event.description);
    else if (event.event && typeof event.event === "string") parts.push(event.event);
    else if (event.group_event && typeof event.group_event === "string") parts.push(event.group_event);
    const text = parts.join(". ");
    this.speak(text, L);
  }
}

export const narrator = new Narrator();
