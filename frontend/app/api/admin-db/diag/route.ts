/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function b64urlDecode(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  const str = Buffer.from(s, "base64").toString("utf8");
  try { return JSON.parse(str); } catch { return str; }
}
function decodeJwtNoVerify(jwt?: string | null) {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  const header = b64urlDecode(parts[0]);
  const payload = b64urlDecode(parts[1]);
  return { header, payload };
}
function extractProjectRefFromUrl(url?: string | null) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.host.split(".")[0]; // <ref>.supabase.co -> <ref>
  } catch { return ""; }
}

export async function GET() {
  console.log(">>> DIAG ROUTE EXECUTED", new Date().toISOString());

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const sr  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const srDecoded   = decodeJwtNoVerify(sr);
  const anonDecoded = decodeJwtNoVerify(anon);
  const urlRef = extractProjectRefFromUrl(url);
  const keyRef = extractProjectRefFromUrl(srDecoded?.payload?.iss || "");

  const summary: any = {
    ok: false,
    url,
    urlProjectRef: urlRef || null,
    serviceRoleLength: sr.length,
    anonKeyLength: anon.length,
    decodedRole_serviceRole: srDecoded?.payload?.role || null,
    decodedRole_anon: anonDecoded?.payload?.role || null,
    keyProjectRef: keyRef || null,
    projectRefMatch: urlRef && keyRef ? urlRef === keyRef : null,
    sdk: null,
    rest: null,
  };

  if (!url || !sr) {
    return NextResponse.json({ ...summary, error: "Missing env(s)" }, { status: 500 });
  }

  try {
    const admin = createClient(url, sr, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    summary.sdk = { ok: !error, error: error?.message || null, sampleUsers: data?.users?.length ?? null };
  } catch (e: any) {
    summary.sdk = { ok: false, error: e?.message || String(e) };
  }

  try {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "GET",
      headers: { apikey: sr, Authorization: `Bearer ${sr}` },
    });
    summary.rest = { ok: res.ok, status: res.status, statusText: res.statusText };
  } catch (e: any) {
    summary.rest = { ok: false, error: e?.message || String(e) };
  }

  summary.ok = Boolean(summary.sdk?.ok || summary.rest?.ok);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 401 });
}

