import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";

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

    const bucket = role === "cover" ? "journey-covers" : "media";
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
