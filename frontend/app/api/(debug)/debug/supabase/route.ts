/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureDebugAccess } from "@/lib/debug/access";
import {
  mask,
  loadEnvLocalLines,
  readEnvLocalVar,
  resolveAnonKey,
  resolveServiceRoleKey,
  resolveSupabaseUrl,
} from "@/lib/debug/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function b64urlDecode(segment: string) {
  let normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  if (padding) normalized += "=".repeat(4 - padding);
  const decoded = Buffer.from(normalized, "base64").toString("utf8");
  try {
    return JSON.parse(decoded);
  } catch {
    return decoded;
  }
}

function decodeJwt(token?: string | null) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  return {
    header: b64urlDecode(parts[0]),
    payload: b64urlDecode(parts[1]),
  };
}

async function pingSupabase(url: string, serviceRole: string) {
  try {
    const client = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const primary = await client.from("personas").select("id", { head: true, count: "exact" });
    if (!primary.error) {
      return {
        table: "personas",
        status: primary.status,
        count: primary.count ?? null,
        error: null,
      };
    }

    const fallback = await client.from("widgets").select("id", { head: true, count: "exact" });
    return {
      table: "widgets",
      status: fallback.status,
      count: fallback.count ?? null,
      error: fallback.error?.message || primary.error?.message || null,
    };
  } catch (e: any) {
    return {
      table: null,
      status: null,
      count: null,
      error: e?.message || String(e),
    };
  }
}

export async function GET(req: Request) {
  const guard = await ensureDebugAccess(req);
  if (!guard.ok) return guard.response;

  const urlFromEnv = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const urlFromFile = readEnvLocalVar("NEXT_PUBLIC_SUPABASE_URL") || "";
  const serviceRoleFromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const serviceRoleFromFile = readEnvLocalVar("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonFromEnv = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const anonFromFile = readEnvLocalVar("NEXT_PUBLIC_SUPABASE_ANON_KEY") || "";

  const url = resolveSupabaseUrl();
  const serviceRole = resolveServiceRoleKey();
  const anonKey = resolveAnonKey();

  const envFile = loadEnvLocalLines([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  const looksPlaceholder = /LA-TUA|SERVICE|PLACEHOLDER/i.test(serviceRole);
  const serviceRoleValid = serviceRole.length >= 60 && !looksPlaceholder;
  const anonKeyValid = anonKey.length >= 40 && !/PLACEHOLDER/i.test(anonKey);

  const serviceRoleSource = serviceRoleFromEnv ? "process" : serviceRoleFromFile ? "file" : "none";
  const anonKeySource = anonFromEnv ? "process" : anonFromFile ? "file" : "none";
  const urlSource = urlFromEnv ? "process" : urlFromFile ? "file" : "none";

  const decodedServiceRole = decodeJwt(serviceRoleValid ? serviceRole : null);
  const decodedAnonKey = decodeJwt(anonKeyValid ? anonKey : null);

  let connectivity = null;
  if (url && serviceRoleValid) {
    connectivity = await pingSupabase(url, serviceRole);
  }

  return NextResponse.json({
    envFile: {
      path: envFile.path,
      exists: envFile.exists,
      preview: envFile.lines,
    },
    runtimeEnv: {
      NEXT_PUBLIC_SUPABASE_URL: url || null,
      NEXT_PUBLIC_SUPABASE_URL_source: urlSource,
      NEXT_PUBLIC_SUPABASE_ANON_KEY_length: anonKey.length,
      NEXT_PUBLIC_SUPABASE_ANON_KEY_masked: mask(anonKey),
      NEXT_PUBLIC_SUPABASE_ANON_KEY_source: anonKeySource,
      SUPABASE_SERVICE_ROLE_KEY_length: serviceRole.length,
      SUPABASE_SERVICE_ROLE_KEY_masked: mask(serviceRole),
      SUPABASE_SERVICE_ROLE_KEY_source: serviceRoleSource,
      SUPABASE_SERVICE_ROLE_KEY_placeholder: looksPlaceholder,
    },
    tokens: {
      serviceRole: decodedServiceRole,
      anonKey: decodedAnonKey,
    },
    connectivity: connectivity || {
      table: null,
      status: null,
      count: null,
      error: serviceRoleValid && url ? null : "Missing valid URL or service role",
    },
    meta: {
      nodeEnv: process.env.NODE_ENV || null,
      userId: guard.userId ?? null,
      serviceRoleValid,
      anonKeyValid,
    },
  });
}
