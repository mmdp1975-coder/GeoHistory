/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";
import { requireAdmin } from "@/lib/api/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

type DeleteMode = "both" | "profile-only";

const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function response(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function parseMode(url: URL): DeleteMode {
  const modeParam = url.searchParams.get("mode")?.toLowerCase();
  if (modeParam === "profile" || modeParam === "profile-only") return "profile-only";

  const profileOnlyFlag = url.searchParams.get("profileOnly") ?? url.searchParams.get("profile_only");
  if (profileOnlyFlag && /^(1|true|yes)$/i.test(profileOnlyFlag)) {
    return "profile-only";
  }

  return "both";
}

function userNotFound(message?: string) {
  return /user not found/i.test(message || "");
}

async function removeAuthUser(uid: string) {
  const result = await supabaseAdmin.auth.admin.deleteUser(uid);
  if (!result.error) {
    return { ok: true as const, via: "sdk" };
  }

  const rest = await fetch(`${PROJECT_URL}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });

  if (rest.ok) {
    return { ok: true as const, via: "rest" };
  }

  const text = await rest.text().catch(() => "");
  const message = result.error?.message || text || "Auth delete failed";
  if (userNotFound(message)) {
    return { ok: false as const, status: 404, code: "AUTH_USER_NOT_FOUND", message };
  }

  const status = /unauthorized|forbidden/i.test(message) ? 403 : 400;
  return { ok: false as const, status, message };
}

async function removeProfile(uid: string) {
  const first = await supabaseAdmin.from("profiles").delete().eq("id", uid);
  if (!first.error) {
    return { ok: true as const, table: "profiles" };
  }

  const maybeMissing = /relation .* does not exist/i.test(first.error.message) || (first.error as any)?.code === "42P01";
  if (maybeMissing) {
    const second = await supabaseAdmin.from("profile").delete().eq("id", uid);
    if (!second.error) {
      return { ok: true as const, table: "profile" };
    }
    return { ok: false as const, status: 500, message: `DB deletion failed (profile): ${second.error.message}` };
  }

  return { ok: false as const, status: 500, message: `DB deletion failed (profiles): ${first.error.message}` };
}

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  return NextResponse.json({ ok: true, route: "users/[id]", supported: ["DELETE"] });
}

export async function DELETE(req: Request, { params }: Context) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const uid = (params?.id || new URL(req.url).searchParams.get("id") || "").trim();
    if (!uid) {
      return response(400, "Missing user id");
    }

    if (!PROJECT_URL || !SERVICE_ROLE) {
      return response(500, "Missing Supabase env vars");
    }

    const mode = parseMode(new URL(req.url));

    if (mode === "profile-only") {
      const authRecord = await supabaseAdmin.auth.admin.getUserById(uid);
      if (authRecord.data?.user) {
        return NextResponse.json(
          { error: "Auth user exists; use mode=both", code: "AUTH_USER_EXISTS", uid },
          { status: 409 }
        );
      }

      const profileRemoval = await removeProfile(uid);
      if (!profileRemoval.ok) {
        return response(profileRemoval.status, profileRemoval.message);
      }

      return NextResponse.json({ ok: true, mode, message: "Profile deleted (orphan)" });
    }

    const authRemoval = await removeAuthUser(uid);
    if (!authRemoval.ok) {
      if (authRemoval.code === "AUTH_USER_NOT_FOUND") {
        return NextResponse.json(
          { error: "Auth user not found", code: authRemoval.code, uid },
          { status: authRemoval.status }
        );
      }
      return response(authRemoval.status, authRemoval.message);
    }

    const profileRemoval = await removeProfile(uid);
    if (!profileRemoval.ok) {
      return response(profileRemoval.status, profileRemoval.message);
    }

    return NextResponse.json({ ok: true, mode, message: "User & profile deleted" });
  } catch (e: any) {
    return response(500, e?.message || "Internal Server Error");
  }
}

export async function PATCH(req: Request, { params }: Context) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const uid = (params?.id || "").trim();
    if (!uid) {
      return response(400, "Missing user id");
    }

    const payload = await req.json().catch(() => ({}));
    if (!payload || typeof payload !== "object") {
      return response(400, "Invalid JSON body");
    }

    const { email, password, phone, user_metadata, app_metadata, ban, email_confirm, phone_confirm } = payload as any;

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(uid, {
      email,
      password,
      phone,
      user_metadata,
      app_metadata,
      email_confirm,
      phone_confirm,
      ban_duration: typeof ban === "string" ? ban : undefined,
    } as any);
    if (error) throw error;

    return NextResponse.json({ ok: true, user: data?.user ?? null });
  } catch (e: any) {
    return response(500, e?.message || "Internal Server Error");
  }
}
