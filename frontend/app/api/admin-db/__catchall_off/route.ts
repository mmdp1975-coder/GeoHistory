// app/api/admin-db/[...slug]/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabaseServerClient";

async function ensureAdmin(req: Request) {
  // DEV BYPASS via header e .env.local (opzionale)
  const bypassHeader = req.headers.get("x-dev-bypass") || "";
  const bypassEnv = process.env.API_DEV_BYPASS_TOKEN || "";
  if (bypassHeader && bypassEnv && bypassHeader === bypassEnv) {
    return { ok: true as const, userId: "dev-bypass" };
  }

  // 1) Authorization: Bearer <jwt>
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (data?.user && !error) {
      const uid = data.user.id;
      const { data: prof, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("is_admin")
        .eq("id", uid)
        .single();
      if (pErr) return { ok: false as const, status: 500, error: pErr.message };
      if (prof?.is_admin) return { ok: true as const, userId: uid };
      return { ok: false as const, status: 403, error: "Forbidden" };
    }
  }

  // 2) Cookie SSR (fallback)
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (pErr) return { ok: false as const, status: 500, error: pErr.message };
    if (prof?.is_admin) return { ok: true as const, userId: user.id };
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: false as const, status: 401, error: "Unauthorized" };
}

export async function GET(req: Request, { params }: { params: { slug?: string[] } }) {
  try {
    const guard = await ensureAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const slug = params.slug || [];
    const url = new URL(req.url);

    // /api/admin-db/tables  → usa RPC
    if (slug.length === 1 && slug[0] === "tables") {
      const { data, error } = await supabaseAdmin.rpc("list_public_tables");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const tables = (data || []).map((r: any) => r.table_name);
      return NextResponse.json({ tables });
    }

    // /api/admin-db/:table/meta  → usa RPC
    if (slug.length === 2 && slug[1] === "meta") {
      const table = slug[0];
      if (table === "users") {
        return NextResponse.json({
          table: "users",
          columns: [
            { column_name: "id", data_type: "uuid" },
            { column_name: "email", data_type: "text" },
            { column_name: "created_at", data_type: "timestamptz" },
            { column_name: "last_sign_in_at", data_type: "timestamptz" },
          ],
        });
      }
      const { data: cols, error } = await supabaseAdmin.rpc("list_table_columns", { p_table: table });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ table, columns: cols || [] });
    }

    // /api/admin-db/:table  (listing)
    if (slug.length === 1) {
      const table = slug[0];

      // Speciale: users (Auth)
      if (table === "users") {
        const query = url.searchParams.get("query")?.trim() || "";
        const page = parseInt(url.searchParams.get("page") || "1");
        const perPage = parseInt(url.searchParams.get("perPage") || "20");
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        let users = data?.users || [];
        if (query) {
          const q = query.toLowerCase();
          users = users.filter(
            (u) =>
              u.email?.toLowerCase().includes(q) ||
              u.id.includes(q) ||
              u.user_metadata?.first_name?.toLowerCase?.().includes(q) ||
              u.user_metadata?.last_name?.toLowerCase?.().includes(q)
          );
        }
        const ids = users.map((u) => u.id);
        const { data: profs } = await supabaseAdmin.from("profiles").select("*").in("id", ids);
        const profiles: Record<string, any> = {};
        for (const p of profs || []) profiles[p.id] = p;
        return NextResponse.json({ users, profiles, page, perPage, total: data?.total ?? users.length });
      }

      // Listing generico (public.*)
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
      const pageSize = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("pageSize") || "25")));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { count, error: cntErr } = await supabaseAdmin.from(table).select("*", { count: "exact", head: true });
      if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 });

      const { data: rows, error: listErr } = await supabaseAdmin.from(table).select("*").range(from, to);
      if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

      return NextResponse.json({ table, page, pageSize, total: count ?? 0, rows: rows || [] });
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { slug?: string[] } }) {
  try {
    const guard = await ensureAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const slug = params.slug || [];
    if (slug.length !== 1) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

    const table = slug[0];
    if (table === "users")
      return NextResponse.json({ error: "Insert not supported for users" }, { status: 405 });

    const body = await req.json().catch(() => ({}));
    const { data, error } = await supabaseAdmin.from(table).insert(body).select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ inserted: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
