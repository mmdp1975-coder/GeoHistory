import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  persona_id?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const id = (body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    const updates: Record<string, any> = { id };

    if (body.full_name !== undefined) updates.full_name = body.full_name;
    if (body.first_name !== undefined) updates.first_name = body.first_name;
    if (body.last_name !== undefined) updates.last_name = body.last_name;
    if (body.username !== undefined) updates.username = body.username;
    if (body.persona_id !== undefined) updates.persona_id = body.persona_id;

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(updates, { onConflict: "id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
