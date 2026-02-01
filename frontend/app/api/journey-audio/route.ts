import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";

const TTS_MAX_CHARS = 3500;

const splitTextForTts = (text: string, maxChars: number) => {
  const chunks: string[] = [];
  const parts = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  let buffer = "";
  parts.forEach((part) => {
    if (!buffer) {
      buffer = part;
      return;
    }
    if (buffer.length + part.length + 2 <= maxChars) {
      buffer = `${buffer}\n\n${part}`;
      return;
    }
    chunks.push(buffer);
    buffer = part;
  });
  if (buffer) chunks.push(buffer);
  if (!chunks.length && text.trim()) chunks.push(text.trim());
  return chunks;
};

const concatArrayBuffers = (buffers: ArrayBuffer[]) => {
  const total = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  buffers.forEach((buf) => {
    merged.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  });
  return merged.buffer;
};

const sanitizeFilePart = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "journey";

const AUDIO_BUCKET = "journey-audio";
const ATTACH_ROLE = "gallery";

const ensureAudioBucket = async () => {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) {
    throw new Error(`Storage bucket lookup failed: ${error.message}`);
  }
  if (buckets?.some((b) => b.name === AUDIO_BUCKET)) {
    return;
  }
  const { error: createErr } = await supabaseAdmin.storage.createBucket(AUDIO_BUCKET, {
    public: true,
    allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav"],
  });
  if (createErr && !/exists/i.test(createErr.message || "")) {
    throw new Error(`Storage bucket create failed: ${createErr.message}`);
  }
};

const findOrCreateMediaAsset = async (params: {
  storagePath: string;
  publicUrl: string;
  sourceUrl?: string | null;
}) => {
  const { storagePath, publicUrl, sourceUrl } = params;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("media_assets")
    .select("id")
    .eq("storage_bucket", AUDIO_BUCKET)
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (existingError && existingError.code !== "PGRST116") {
    throw new Error(`media_assets lookup failed: ${existingError.message}`);
  }
  if (existing?.id) {
    return existing.id as string;
  }
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("media_assets")
    .insert({
      storage_bucket: AUDIO_BUCKET,
      storage_path: storagePath,
      public_url: publicUrl,
      source_url: sourceUrl ?? publicUrl,
      media_type: "audio",
      status: "ready",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError) {
    throw new Error(`media_assets insert failed: ${insertError.message}`);
  }
  return inserted.id as string;
};

const ensureMediaAttachment = async (params: {
  groupEventId: string;
  mediaId: string;
}) => {
  const { groupEventId, mediaId } = params;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("media_attachments")
    .select("id")
    .eq("group_event_id", groupEventId)
    .eq("entity_type", "group_event")
    .eq("media_id", mediaId)
    .maybeSingle();
  if (existingError && existingError.code !== "PGRST116") {
    throw new Error(`media_attachments lookup failed: ${existingError.message}`);
  }
  if (existing?.id) return existing.id as string;
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("media_attachments")
    .insert({
      media_id: mediaId,
      entity_type: "group_event",
      group_event_id: groupEventId,
      role: ATTACH_ROLE,
      sort_order: 0,
      is_primary: false,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError) {
    throw new Error(`media_attachments insert failed: ${insertError.message}`);
  }
  return inserted.id as string;
};

export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const lang = typeof payload?.lang === "string" ? payload.lang.trim() : "";
  const voice = typeof payload?.voice === "string" ? payload.voice.trim() : "";
  const tone = typeof payload?.tone === "string" ? payload.tone.trim() : "";
  const journeyId = typeof payload?.journeyId === "string" ? payload.journeyId.trim() : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";

  if (!journeyId) {
    return NextResponse.json({ error: "Missing journeyId" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }
  if (!lang || (lang !== "it" && lang !== "en")) {
    return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
  }
  if (!voice) {
    return NextResponse.json({ error: "Missing voice" }, { status: 400 });
  }

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const instructions = tone ? `Tone: ${tone}` : undefined;
  const baseBody: Record<string, any> = {
    model,
    voice,
    input: "",
    response_format: "mp3",
  };

  const callOpenAI = async (input: string) => {
    const body: Record<string, any> = { ...baseBody, input };
    if (instructions) body.instructions = instructions;
    const apiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (apiRes.ok) {
      return { ok: true as const, arrayBuffer: await apiRes.arrayBuffer() };
    }
    const errText = await apiRes.text();
    const shouldRetry =
      instructions && apiRes.status === 400 && /instructions|unknown parameter|unsupported/i.test(errText || "");
    if (shouldRetry) {
      const retryRes = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...baseBody, input }),
        signal: req.signal,
      });
      if (!retryRes.ok) {
        const retryText = await retryRes.text();
        return { ok: false as const, status: retryRes.status, errText: retryText };
      }
      return { ok: true as const, arrayBuffer: await retryRes.arrayBuffer() };
    }
    return { ok: false as const, status: apiRes.status, errText };
  };

  try {
    const chunks = splitTextForTts(text, TTS_MAX_CHARS);
    const buffers: ArrayBuffer[] = [];
    for (const chunk of chunks) {
      const result = await callOpenAI(chunk);
      if (!result.ok) {
        return NextResponse.json(
          { error: "OpenAI TTS error", status: result.status },
          { status: 500 },
        );
      }
      buffers.push(result.arrayBuffer);
    }

    const merged = concatArrayBuffers(buffers);
    await ensureAudioBucket();

    const safeTitle = sanitizeFilePart(title);
    const langSuffix = lang ? `_${lang}` : "";
    const fileName = `${journeyId}_${safeTitle}${langSuffix}.mp3`;
    const storagePath = `${journeyId}/${fileName}`;

    const { data, error: uploadError } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, Buffer.from(merged), {
        upsert: true,
        contentType: "audio/mpeg",
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }
    const { data: pub } = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(data?.path || storagePath);
    const publicUrl = pub?.publicUrl || "";
    const assetId = await findOrCreateMediaAsset({
      storagePath: data?.path || storagePath,
      publicUrl,
      sourceUrl: publicUrl,
    });
    await ensureMediaAttachment({ groupEventId: journeyId, mediaId: assetId });

    return NextResponse.json({ ok: true, fileName, publicUrl, assetId });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Audio generation error",
        detail: process.env.NODE_ENV === "development" ? err?.message || String(err) : undefined,
      },
      { status: 500 },
    );
  }
}
