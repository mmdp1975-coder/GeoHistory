import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";

const AUDIO_BUCKET = "journey-audio";

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

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }
    const role = String(form.get("role") || "");
    const kind = String(form.get("kind") || "");
    const entityId = String(form.get("entityId") || "tmp");

    if (kind === "audio") {
      await ensureAudioBucket();
    }
    const bucket =
      role === "cover"
        ? "journey-covers"
        : kind === "audio"
        ? AUDIO_BUCKET
        : "media";
    const ext = (() => {
      const parts = file.name.split(".");
      return parts.length > 1 ? parts.pop() : "bin";
    })();
    const key = `${role === "cover" ? "covers" : "media"}/${entityId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { data, error } = await supabaseAdmin.storage.from(bucket).upload(key, Buffer.from(arrayBuffer), {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(data?.path || key);
    const publicUrl = pub?.publicUrl || "";
    return NextResponse.json({ publicUrl, path: data?.path || key, bucket, kind: kind || "image" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Upload failed" }, { status: 500 });
  }
}
