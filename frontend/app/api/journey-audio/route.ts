import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";

const TTS_MAX_CHARS = 3500;
const PAUSE_INPUT = " ";
const PAUSE_INSTRUCTIONS = "Silence only. No speech. Short pause.";

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

const findId3Offset = (data: Uint8Array) => {
  if (data.length < 10) return 0;
  if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return 0;
  const size =
    ((data[6] & 0x7f) << 21) |
    ((data[7] & 0x7f) << 14) |
    ((data[8] & 0x7f) << 7) |
    (data[9] & 0x7f);
  return 10 + size;
};

const estimateMp3DurationSeconds = (buffer: ArrayBuffer) => {
  const data = new Uint8Array(buffer);
  const offset = findId3Offset(data);
  const len = data.length;
  const bitrateTableV1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const bitrateTableV2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const sampleRateTable = {
    "1": [44100, 48000, 32000],
    "2": [22050, 24000, 16000],
    "2.5": [11025, 12000, 8000],
  } as const;
  for (let i = offset; i < len - 4; i += 1) {
    if (data[i] !== 0xff || (data[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (data[i + 1] >> 3) & 0x03;
    const layerBits = (data[i + 1] >> 1) & 0x03;
    if (layerBits !== 0x01) continue; // Layer III only
    const version =
      versionBits === 0x03 ? "1" : versionBits === 0x02 ? "2" : versionBits === 0x00 ? "2.5" : null;
    if (!version) continue;
    const bitrateIndex = (data[i + 2] >> 4) & 0x0f;
    const sampleIndex = (data[i + 2] >> 2) & 0x03;
    const bitrate =
      version === "1" ? bitrateTableV1L3[bitrateIndex] : bitrateTableV2L3[bitrateIndex];
    const sampleRate = sampleRateTable[version][sampleIndex] ?? 0;
    if (!bitrate || !sampleRate) continue;
    const dataBytes = len - offset;
    return (dataBytes * 8) / (bitrate * 1000);
  }
  return 0;
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
    await supabaseAdmin
      .from("media_assets")
      .update({
        public_url: publicUrl,
        source_url: sourceUrl ?? publicUrl,
        media_type: "audio",
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (process.env.NODE_ENV === "development") {
      console.log("[journey-audio] asset updated", { assetId: existing.id, storagePath });
    }
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
  if (process.env.NODE_ENV === "development") {
    console.log("[journey-audio] asset inserted", { assetId: inserted.id, storagePath });
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
  if (existing?.id) {
    if (process.env.NODE_ENV === "development") {
      console.log("[journey-audio] attachment exists", { attachmentId: existing.id, mediaId });
    }
    return existing.id as string;
  }
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
  if (process.env.NODE_ENV === "development") {
    console.log("[journey-audio] attachment inserted", { attachmentId: inserted.id, mediaId });
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
  if (process.env.NODE_ENV === "development") {
    console.log("[journey-audio] payload", {
      journeyId: payload?.journeyId,
      lang: payload?.lang,
      voice: payload?.voice,
      tone: payload?.tone,
      textLen: typeof payload?.text === "string" ? payload.text.length : 0,
      segments: Array.isArray(payload?.segments) ? payload.segments.length : 0,
    });
  }

  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const segments = Array.isArray(payload?.segments) ? payload.segments : null;
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

  const callOpenAI = async (input: string, overrideInstructions?: string) => {
    const body: Record<string, any> = { ...baseBody, input };
    const finalInstructions = overrideInstructions ?? instructions;
    if (finalInstructions) body.instructions = finalInstructions;
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
    const buffers: ArrayBuffer[] = [];
    const timelineSegments: Array<{ kind: string; index?: number; eventId?: string | null; start: number; end: number }> = [];
    let cursor = 0;

    if (segments && segments.length) {
      for (const seg of segments) {
        const isPause = String(seg?.kind || "") === "pause";
        const input = isPause ? PAUSE_INPUT : typeof seg?.text === "string" ? seg.text.trim() : "";
        if (!input) continue;
        if (process.env.NODE_ENV === "development") {
          console.log("[journey-audio] segment", {
            kind: seg?.kind,
            index: seg?.index,
            len: input.length,
          });
        }
        const result = await callOpenAI(input, isPause ? PAUSE_INSTRUCTIONS : undefined);
        if (!result.ok) {
          return NextResponse.json(
            { error: "OpenAI TTS error", status: result.status },
            { status: 500 },
          );
        }
        const duration = estimateMp3DurationSeconds(result.arrayBuffer);
        const start = cursor;
        const end = Math.max(start, start + (Number.isFinite(duration) ? duration : 0));
        cursor = end;
        timelineSegments.push({
          kind: seg.kind || "event",
          index: Number.isFinite(seg.index) ? Number(seg.index) : undefined,
          eventId: seg.eventId ?? null,
          start,
          end,
        });
        buffers.push(result.arrayBuffer);
      }
    } else {
      const chunks = splitTextForTts(text, TTS_MAX_CHARS);
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
    }

    const merged = concatArrayBuffers(buffers);
    await ensureAudioBucket();
    if (process.env.NODE_ENV === "development") {
      console.log("[journey-audio] bucket ok", { bucket: AUDIO_BUCKET });
    }

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
    if (process.env.NODE_ENV === "development") {
      console.log("[journey-audio] uploaded", { path: data?.path || storagePath });
    }
    const { data: pub } = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(data?.path || storagePath);
    const publicUrl = pub?.publicUrl || "";
    const assetId = await findOrCreateMediaAsset({
      storagePath: data?.path || storagePath,
      publicUrl,
      sourceUrl: publicUrl,
    });
    if (process.env.NODE_ENV === "development") {
      console.log("[journey-audio] asset", { assetId });
    }
    const attachmentId = await ensureMediaAttachment({ groupEventId: journeyId, mediaId: assetId });
    if (process.env.NODE_ENV === "development") {
      console.log("[journey-audio] attachment ok", { groupEventId: journeyId });
    }

    // Remove previous audio attachments for same lang on this journey (keep only latest generated asset).
    const cleanupLangSuffix = lang ? `_${lang}.mp3` : "";
    const { data: oldAudioRows, error: oldAudioErr } = await supabaseAdmin
      .from("v_media_attachments_expanded")
      .select("id,media_id,storage_path,public_url")
      .eq("group_event_id", journeyId)
      .eq("entity_type", "group_event")
      .eq("media_type", "audio");
    if (oldAudioErr) {
      console.warn("[journey-audio] cleanup lookup error:", oldAudioErr.message);
    } else {
      const toDelete = (oldAudioRows ?? [])
        .filter((row: any) => {
          if (!cleanupLangSuffix) return false;
          const path = (row.storage_path || row.public_url || "").toString().toLowerCase();
          return row.media_id !== assetId && path.endsWith(cleanupLangSuffix);
        })
        .map((row: any) => row.id)
        .filter(Boolean);
      const toDeleteMediaIds = (oldAudioRows ?? [])
        .filter((row: any) => {
          if (!cleanupLangSuffix) return false;
          const path = (row.storage_path || row.public_url || "").toString().toLowerCase();
          return row.media_id && row.media_id !== assetId && path.endsWith(cleanupLangSuffix);
        })
        .map((row: any) => row.media_id)
        .filter(Boolean);
      if (toDelete.length) {
        const { error: delErr } = await supabaseAdmin.from("media_attachments").delete().in("id", toDelete);
        if (delErr) {
          console.warn("[journey-audio] cleanup delete error:", delErr.message);
        }
      }
      if (toDeleteMediaIds.length) {
        const { error: assetErr } = await supabaseAdmin.from("media_assets").delete().in("id", toDeleteMediaIds);
        if (assetErr) {
          console.warn("[journey-audio] cleanup media_assets delete error:", assetErr.message);
        }
      }
    }

    // Remove previous files in storage for same lang (keep only latest file).
    if (cleanupLangSuffix) {
      try {
        const { data: listed, error: listErr } = await supabaseAdmin.storage
          .from(AUDIO_BUCKET)
          .list(journeyId, { limit: 200 });
        if (listErr) {
          console.warn("[journey-audio] storage list error:", listErr.message);
        } else if (listed?.length) {
          const keepPath = data?.path || storagePath;
          const toRemove = listed
            .map((item) => item?.name)
            .filter((name): name is string => !!name)
            .filter((name) => name.toLowerCase().endsWith(cleanupLangSuffix))
            .map((name) => `${journeyId}/${name}`)
            .filter((path) => path !== keepPath);
          if (toRemove.length) {
            const { error: delErr } = await supabaseAdmin.storage.from(AUDIO_BUCKET).remove(toRemove);
            if (delErr) {
              console.warn("[journey-audio] storage remove error:", delErr.message);
            }
          }
        }
      } catch (err: any) {
        console.warn("[journey-audio] storage cleanup error:", err?.message || err);
      }
    }

    if (timelineSegments.length) {
      const { data: existingMeta } = await supabaseAdmin
        .from("media_assets")
        .select("metadata")
        .eq("id", assetId)
        .maybeSingle();
      const baseMeta = (existingMeta as any)?.metadata || {};
      const hasIntro = timelineSegments.some((s) => s.kind === "intro");
      await supabaseAdmin
        .from("media_assets")
        .update({
          metadata: {
            ...baseMeta,
            audio_timeline: {
              version: 1,
              hasIntro,
              segments: timelineSegments,
              total: cursor,
            },
          },
        })
        .eq("id", assetId);
      if (process.env.NODE_ENV === "development") {
        console.log("[journey-audio] timeline saved", { segments: timelineSegments.length });
      }
    }

    return NextResponse.json({ ok: true, fileName, publicUrl, assetId, attachmentId });
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
