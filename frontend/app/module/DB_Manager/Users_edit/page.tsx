"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, any> | null;
  app_metadata?: Record<string, any> | null;
  identities?: any[] | null;
};

type ProfileRow = Record<string, any> & { id: string };

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_TOKEN || "";
const devHeaders: Record<string, string> = DEV_BYPASS ? { "x-dev-bypass": DEV_BYPASS } : ({} as Record<string, string>);
const PAGE_SIZE = 20;

function toPrettyJSON(value: any) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function tryParseJSON(value: string) {
  try {
    return JSON.parse(value);
  } catch (error: any) {
    const message = error?.message || "Invalid JSON";
    return new Error(message);
  }
}

async function safeJson(res: Response) {
  const txt = await res.text();
  if (!txt) return res.ok ? {} : { error: `HTTP ${res.status}` };
  try {
    return JSON.parse(txt);
  } catch {
    return { error: txt };
  }
}

export default function UsersAdminPage() {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<SupabaseAuthUser[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opMsg, setOpMsg] = useState<string | null>(null);

  const [authDraft, setAuthDraft] = useState("{}");
  const [profileDraft, setProfileDraft] = useState("{}");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState(
    toPrettyJSON({ email: "", password: "", user_metadata: { first_name: "", last_name: "" } })
  );
  const [createErr, setCreateErr] = useState<string | null>(null);

  const jsonHeaders: HeadersInit = useMemo(() => ({ "Content-Type": "application/json", ...devHeaders }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setOpMsg(null);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: String(PAGE_SIZE) });
      if (query.trim()) params.set("query", query.trim());
      const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store", headers: devHeaders });
      const json: any = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Failed loading users");

      setUsers(Array.isArray(json.users) ? json.users : []);
      setProfiles(json.profiles || {});
      setTotal(Number(json.total || 0));

      const firstId = json.users?.[0]?.id ?? null;
      const current = json.users?.some((u: any) => u.id === selectedId) ? selectedId : firstId;
      setSelectedId(current ?? null);
    } catch (error: any) {
      setOpMsg(error?.message ?? "Load error");
      setUsers([]);
      setProfiles({});
      setTotal(0);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [page, query, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  // Update editors when selected user changes or profiles/users reload
  useEffect(() => {
    if (!selectedId) {
      setAuthDraft("{}");
      setProfileDraft("{}");
      return;
    }
    const user = users.find((u) => u.id === selectedId);
    const profile = profiles[selectedId];
    setAuthDraft(
      toPrettyJSON({
        email: user?.email ?? "",
        password: "",
        phone: user?.phone ?? null,
        user_metadata: user?.user_metadata ?? {},
        app_metadata: user?.app_metadata ?? undefined,
      })
    );
    setProfileDraft(toPrettyJSON(profile ?? { id: selectedId }));
  }, [selectedId, users, profiles]);

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedId) || null, [users, selectedId]);
  const selectedProfile = selectedId ? profiles[selectedId] ?? null : null;
  const totalPages = total ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;

  async function handleProfileSave() {
    if (!selectedId) return;
    setJsonErr(null);
    const parsed = tryParseJSON(profileDraft);
    if (parsed instanceof Error) {
      setJsonErr(parsed.message);
      return;
    }
    try {
      const res = await fetch(`/api/admin/tables/profiles/rows/${encodeURIComponent(selectedId)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(parsed),
      });
      const json: any = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Update failed");
      setOpMsg("Profile updated");
      await load();
    } catch (error: any) {
      setOpMsg(error?.message ?? "Profile update error");
    }
  }

  async function handleProfileDelete() {
    if (!selectedId) return;
    if (!confirm("Delete only the profile record?")) return;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(selectedId)}?mode=profile-only`, {
        method: "DELETE",
        headers: devHeaders,
      });
      const json: any = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      setOpMsg("Profile deleted");
      await load();
    } catch (error: any) {
      setOpMsg(error?.message ?? "Profile delete error");
    }
  }

  async function handleDeleteUser() {
    if (!selectedId) return;
    if (!confirm("Delete Auth user and profile?")) return;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(selectedId)}`, {
        method: "DELETE",
        headers: devHeaders,
      });
      const json: any = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      setOpMsg("User deleted");
      await load();
    } catch (error: any) {
      setOpMsg(error?.message ?? "User delete error");
    }
  }

  async function handleAuthSave() {
    if (!selectedId) return;
    setJsonErr(null);
    const parsed = tryParseJSON(authDraft);
    if (parsed instanceof Error) {
      setJsonErr(parsed.message);
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(parsed),
      });
      const json: any = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Update failed");
      setOpMsg("Auth user updated");
      await load();
    } catch (error: any) {
      setOpMsg(error?.message ?? "Auth update error");
    }
  }

  async function handleCreateUser() {
    setCreateErr(null);
    const parsed = tryParseJSON(createDraft);
    if (parsed instanceof Error) {
      setCreateErr(parsed.message);
      return;
    }
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(parsed),
      });
      const json: any = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Create failed");
      setCreating(false);
      setCreateDraft(toPrettyJSON({ email: "", password: "" }));
      setOpMsg("User created");
      await load();
    } catch (error: any) {
      setCreateErr(error?.message ?? "Create error");
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Users Admin</h1>
        <div className="ml-auto flex gap-2">
          <Link href="/module/DB_Manager" className="rounded-lg border px-3 py-2 text-sm">DB Manager {'->'}</Link>
          <Link href="/module/DB_Manager/journey_edit" className="rounded-lg border px-3 py-2 text-sm">Journey {'->'}</Link>
        </div>
      </header>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
            placeholder="Search email, id, name..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => setPage(1)}
            disabled={loading}
          >
            Search
          </button>
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? "Close create" : "+ New user"}
          </button>
          <span className="ml-auto text-sm text-neutral-600">
            Page {page} / {totalPages} • {total} users
          </span>
        </div>

        {creating && (
          <div className="mt-4 space-y-2">
            <textarea
              className="w-full rounded-lg border p-3 font-mono text-xs"
              rows={8}
              value={createDraft}
              onChange={(event) => setCreateDraft(event.target.value)}
              spellCheck={false}
            />
            {createErr && <div className="text-sm text-red-600">{createErr}</div>}
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={handleCreateUser}>
              Create user
            </button>
          </div>
        )}

        <div className="mt-4 overflow-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Last sign-in</th>
                <th className="px-3 py-2 text-left">Profile admin?</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-4 text-neutral-500" colSpan={5}>Loading...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-neutral-500" colSpan={5}>No users</td>
                </tr>
              ) : (
                users.map((user) => {
                  const profile = profiles[user.id];
                  const isSelected = user.id === selectedId;
                  return (
                    <tr
                      key={user.id}
                      className={`${isSelected ? "bg-blue-50" : "odd:bg-white even:bg-neutral-50"} cursor-pointer`}
                      onClick={() => setSelectedId(user.id)}
                    >
                      <td className="px-3 py-2">{user.email ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{user.id}</td>
                      <td className="px-3 py-2 text-xs">{user.created_at ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{user.last_sign_in_at ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{profile?.is_admin ? "yes" : "no"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex gap-2 text-sm">
          <button
            className="rounded border px-2 py-1 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Prev
          </button>
          <button
            className="rounded border px-2 py-1 disabled:opacity-50"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || page >= totalPages}
          >
            Next
          </button>
        </div>
      </section>

      {opMsg && <div className="rounded border bg-neutral-50 p-2 text-xs">{opMsg}</div>}

      {selectedUser && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-700">Supabase Auth user</h2>
              <button className="rounded border px-2 py-1 text-xs" onClick={handleAuthSave}>
                Save auth
              </button>
            </div>
            <textarea
              className="h-64 w-full rounded-lg border p-3 font-mono text-xs"
              value={authDraft}
              onChange={(event) => setAuthDraft(event.target.value)}
              spellCheck={false}
            />
            <div className="mt-3 flex gap-2">
              <button className="rounded border px-3 py-2 text-sm" onClick={handleDeleteUser}>
                Delete user + profile
              </button>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-700">Profile row</h2>
              <div className="flex gap-2">
                <button className="rounded border px-2 py-1 text-xs" onClick={handleProfileSave}>
                  Save profile
                </button>
                <button className="rounded border px-2 py-1 text-xs" onClick={handleProfileDelete}>
                  Delete profile only
                </button>
              </div>
            </div>
            <textarea
              className="h-64 w-full rounded-lg border p-3 font-mono text-xs"
              value={profileDraft}
              onChange={(event) => setProfileDraft(event.target.value)}
              spellCheck={false}
            />
            {jsonErr && <div className="mt-2 text-sm text-red-600">{jsonErr}</div>}
          </div>
        </section>
      )}
    </div>
  );
}












