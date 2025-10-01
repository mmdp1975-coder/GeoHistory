// lib/widgets.ts
import { supabase } from "@/lib/supabaseBrowserClient";

export type WidgetRow = {
  id: string | number;
  title?: string;
  subtitle?: string;
  image_url?: string;
  position?: number;
  persona?: string;
};

/**
 * Ritorna i widget per persona.
 * 1) Prova a leggere da una tabella ipotetica "landing_widgets" (persona, title, subtitle, image_url, position)
 * 2) Se la tabella non esiste o è vuota, usa un fallback statico ordinato per "position"
 */
export default async function fetchWidgetsForPersona(personaParam: string): Promise<WidgetRow[]> {
  const persona = (personaParam || "").toUpperCase();

  try {
    const { data, error } = await supabase
      .from("landing_widgets")
      .select("id,title,subtitle,image_url,position,persona")
      .ilike("persona", persona)
      .order("position", { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data as WidgetRow[];
    }
  } catch (_) {
    // ignora: passeremo al fallback
  }

  // Fallback statico minimo (da sostituire quando definiremo i dati reali)
  const base: WidgetRow[] = [
    { id: 1, title: "New Journeys",      subtitle: "Latest curated journeys", position: 1, persona },
    { id: 2, title: "My J Favourites",   subtitle: "Your starred journeys",   position: 2, persona },
    { id: 3, title: "My J Personal",     subtitle: "Drafts & personal notes", position: 3, persona },
    { id: 4, title: "Build your Journey",subtitle: "Create your own",         position: 4, persona },
    { id: 5, title: "J Explorer",        subtitle: "Map & filters",           position: 5, persona },
    { id: 6, title: "Quiz",              subtitle: "Test your knowledge",     position: 6, persona },
  ];

  return base;
}
