// frontend/lib/extractors/youtube.ts
import { YoutubeTranscript } from "youtube-transcript";

export type YouTubeMeta = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  duration_sec?: number | null;
  description?: string;
};

export function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1);
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchYouTubeOEmbed(url: string): Promise<YouTubeMeta> {
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetch(oembed, { headers: { "User-Agent": "GeoHistoryImporter/1.0" } });
  if (!res.ok) return {};
  const data = await res.json();
  // NB: duration non è in oEmbed. La lasciamo null.
  return {
    title: data.title,
    author_name: data.author_name,
    thumbnail_url: data.thumbnail_url,
    duration_sec: null,
    description: undefined
  };
}

export async function fetchYouTubeTranscript(url: string): Promise<string | null> {
  const v = parseYouTubeId(url);
  if (!v) return null;
  try {
    const items = await YoutubeTranscript.fetchTranscript(v, { lang: "en" }).catch(() => []);
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    return items.map((i: any) => i.text).join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}
