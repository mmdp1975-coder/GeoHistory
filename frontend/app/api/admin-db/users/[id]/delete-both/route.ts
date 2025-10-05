/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

function isUserNotFound(msg?: string) {
  return /user not found/i.test(msg || "");
}

async function deleteAuthUser(admin: ReturnType<typeof createClient>, projectUrl: string, sr: string, uid: string) {
  const resp = await admin.auth.admin.deleteUser(uid);
  if (!resp.error) return { ok: true, via: "sdk" };

  // tenta REST
  const rest = await fetch(`${projectUrl}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { apikey: sr, Authorization: `Bearer ${sr}` },
  });

  if (rest.ok) return { ok: true, via: "rest" };

  const txt = await rest.text().catch(() => "");
  const msg = resp.error?.message || txt || "Auth delete failed";
  if (isUserNotFound(msg)) return { ok: false, code: 404, msg, tag: "AUTH_USER_NOT_FOUND" as const };
  const code = /unauthorized|forbidden/i.test(msg) ? 403 : 400;
  return { ok: false, code, msg };
}

async function deleteProfileRecord(admin: ReturnType<typeof createClient>, uid: string) {
  // prima "profiles" (tu ce l'hai al plurale), poi "profile"
  const del1 = await admin.from("profiles").delete().eq("id", uid);
  if (!del1.error) return { ok: true, table: "profiles" };

  const noTable = /relation .* does not exist/i.test(del1.error.message) || (del1.error as any)?.code === "42P01";
  if (noTable) {
    const del2 = await admin.from("profile").delete().eq("id", uid);
    if (!del2.error) return { ok: true, table: "profile" };
    return { ok: false, code: 500, msg: `DB deletion failed (profile): ${del2.error.message}` };
  }
  return { ok: false, code: 500, msg: `DB deletion failed (profiles): ${del1.error.message}` };
}

/** GET di check */
export async function GET() {
  return NextResponse.json({ ok: true, route: "ready" });
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const uid = (params?.id || new URL(req.url).searchParams.get("id") || "").trim();
    if (!uid) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!projectUrl || !serviceRole) return NextResponse.json({ error: "Missing envs" }, { status: 500 });

    const admin = createClient(projectUrl, serviceRole, { auth: { persistSession: false } });

    // 1) Auth prima — se non esiste, fermati e segnala codice specifico
    const auth = await deleteAuthUser(admin, projectUrl, serviceRole, uid);
    if (!auth.ok) {
      if ((auth as any).tag === "AUTH_USER_NOT_FOUND") {
        return NextResponse.json(
          { error: "Auth user not found", code: "AUTH_USER_NOT_FOUND", uid },
          { status: 404 }
        );
      }
      return NextResponse.json({ error: `Auth deletion failed: ${auth.msg}` }, { status: auth.code || 400 });
    }

    // 2) Solo se Auth ok → elimina il profilo
    const prof = await deleteProfileRecord(admin, uid);
    if (!prof.ok) {
      return NextResponse.json({ error: prof.msg }, { status: prof.code || 500 });
    }

    return NextResponse.json({ ok: true, message: "User & Profile deleted atomically" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
