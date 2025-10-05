/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const uid = (params?.id || new URL(req.url).searchParams.get("id") || "").trim();
    if (!uid) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!projectUrl || !serviceRole) return NextResponse.json({ error: "Missing envs" }, { status: 500 });

    const admin = createClient(projectUrl, serviceRole, { auth: { persistSession: false } });

    // 1) Controlla se esiste in Auth
    const u = await admin.auth.admin.getUserById(uid);
    if (u.data?.user) {
      return NextResponse.json(
        { error: "Auth user exists; use delete-both", code: "AUTH_USER_EXISTS", uid },
        { status: 409 }
      );
    }

    // 2) Elimina profilo (tabella 'profiles', fallback 'profile')
    const del1 = await admin.from("profiles").delete().eq("id", uid);
    if (!del1.error) return NextResponse.json({ ok: true, message: "Profile deleted (orphan)" });

    const noTable = /relation .* does not exist/i.test(del1.error.message) || (del1.error as any)?.code === "42P01";
    if (noTable) {
      const del2 = await admin.from("profile").delete().eq("id", uid);
      if (!del2.error) return NextResponse.json({ ok: true, message: "Profile deleted (orphan)" });
      return NextResponse.json({ error: `DB deletion failed (profile): ${del2.error.message}` }, { status: 500 });
    }
    return NextResponse.json({ error: `DB deletion failed (profiles): ${del1.error.message}` }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "delete-profile-only" });
}
