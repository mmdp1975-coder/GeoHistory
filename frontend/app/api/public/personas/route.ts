import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("personas")
      .select("id, code, name_it, name_en")
      .order("code", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const personas = (data || []).filter((persona) => {
      const code = String(persona.code || "").trim().toUpperCase();
      return code !== "ADMIN" && code !== "MOD" && code !== "MODERATOR";
    });

    return NextResponse.json({ personas });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

