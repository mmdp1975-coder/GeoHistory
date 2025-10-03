// frontend/app/api/ingest/video/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchYouTubeOEmbed, fetchYouTubeTranscript, parseYouTubeId } from "@/lib/extractors/youtube";
import { extractEventsFromTranscriptLong } from "@/lib/ai";
import { geocodeOneFreeform } from "@/lib/geocode";
import { countryToContinent } from "@/lib/continents";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ ok: false, error: "URL mancante o invalido" }, { status: 400 });
    }

    let meta: any = {};
    let transcript: string | null = null;

    if (parseYouTubeId(url)) {
      meta = await fetchYouTubeOEmbed(url);
      transcript = await fetchYouTubeTranscript(url);
    }

    const metaTitle = meta?.title || "Journey da video";
    const metaDesc  = meta?.description || "";

    if (!transcript || transcript.trim().length < 300) {
      transcript = `${metaTitle}. ${metaDesc}`.repeat(3);
    }

    const extracted = await extractEventsFromTranscriptLong({ transcript, metaTitle, metaDescription: metaDesc });

    const enrichedEvents: any[] = [];
    for (const ev of extracted.events) {
      let lat: number | undefined;
      let lon: number | undefined;
      let country: string | undefined;

      if (ev.location_text) {
        const g = await geocodeOneFreeform(ev.location_text);
        if (g) { lat = g.lat; lon = g.lon; country = g.country; }
      }

      const continent = countryToContinent(country ?? null);

      enrichedEvents.push({
        // per review UI
        title: ev.title || "",
        description: ev.description || "",
        // per DB events_list
        year_from: ev.year_from ?? null,
        year_to: (ev.year_to ?? ev.year_from) ?? null,
        exact_date: null,
        era: ev.era || "AD",
        continent: continent,
        country: country ?? null,
        location: ev.location_text || null,
        latitude: lat ?? null,
        longitude: lon ?? null
      });
    }

    enrichedEvents.sort((a, b) => (a.year_from ?? 0) - (b.year_from ?? 0));

    return NextResponse.json({
      ok: true,
      proposal: {
        journey: {
          title: extracted.journey_title || metaTitle,
          description: extracted.journey_description || metaDesc || null,
          cover: meta?.thumbnail_url || null
        },
        events: enrichedEvents
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Errore ingestione" }, { status: 500 });
  }
}
