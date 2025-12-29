// frontend/app/api/(admin)/admin/tables/route.ts
// Ritorna l'elenco delle tabelle dello schema "public" per il DB Manager.
// Usa il Service Role (server-side) per non dipendere dalla sessione utente.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // ⚠️ niente Edge: Supabase JS usa API Node

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, serviceKey);
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    // 1) RPC preferita (schema public)
    let names: string[] | null = null;
    try {
      const { data, error } = await supabase.rpc("gh_list_all_tables");
      if (error) throw error;
      names = (data ?? [])
        .map((r: any) => r?.table_name as string)
        .filter(Boolean);
    } catch {
      // 2) Fallback via view (schema public)
      const { data, error } = await supabase.from("v_admin_tables").select("table_name");
      if (error) throw error;
      names = (data ?? [])
        .map((r: any) => r?.table_name as string)
        .filter(Boolean);
    }

    // (opzionale) Filtra se vuoi nascondere alcune tabelle
    // const blacklist = new Set<string>(["_prisma_migrations"]);
    // names = names.filter((n) => !blacklist.has(n));

    return NextResponse.json({ tables: names ?? [] }, { status: 200 });
  } catch (e: any) {
    console.error("[/api/(admin)/admin/tables] error:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
