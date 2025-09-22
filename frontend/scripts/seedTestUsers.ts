/**
 * GeoHistory — Seed 7 test users (@example.com) ALLINEATO agli slug EN
 * - Cancella eventuali omonimi @example.com
 * - Crea 7 utenti in auth (email_confirmed) con Password123!
 * - Upsert dei profili e link a personas via slug EN: student_primary/middle/high
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
// Forza il .env a prevalere sulle env di sistema (override: true)
dotenv.config({ path: ".env", override: true });


const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

type PersonaSlug =
  | "student_primary"
  | "student_middle"
  | "student_high"
  | "appassionato"
  | "researcher"
  | "moderator"
  | "admin";

type TestUser = {
  email: string;
  display_name: string;
  persona_slug: PersonaSlug;
};

const PASSWORD = "Password123!";

const USERS: TestUser[] = [
  { email: "test_student_elementari@example.com", display_name: "Student Primary (Test)",  persona_slug: "student_primary" },
  { email: "test_student_medie@example.com",      display_name: "Student Middle (Test)",   persona_slug: "student_middle" },
  { email: "test_student_superiori@example.com",  display_name: "Student High (Test)",     persona_slug: "student_high" },
  { email: "test_appassionato@example.com",       display_name: "Fan (Test)",              persona_slug: "appassionato" },
  { email: "test_researcher@example.com",         display_name: "Researcher (Test)",       persona_slug: "researcher" },
  { email: "test_moderator@example.com",          display_name: "Moderator (Test)",        persona_slug: "moderator" },
  { email: "test_admin@example.com",              display_name: "Admin (Test)",            persona_slug: "admin" },
];

async function listAllUsers() {
  const perPage = 1000; let page = 1; let acc: any[] = [];
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users ?? [];
    acc = acc.concat(batch);
    if (batch.length < perPage) break;
    page++;
  }
  return acc;
}

async function deleteExistingTargets() {
  const all = await listAllUsers();
  const targets = new Set(USERS.map(u => u.email));
  const toDelete = all.filter(u => targets.has(u.email));
  for (const u of toDelete) {
    await supabase.auth.admin.deleteUser(u.id);
    console.log(`🗑️  Deleted existing: ${u.email}`);
  }
}

async function personaMap(): Promise<Record<PersonaSlug, string>> {
  const { data, error } = await supabase.from("personas").select("id, slug");
  if (error) throw error;
  const map = {} as Record<PersonaSlug, string>;
  for (const r of data) {
    const s = r.slug as PersonaSlug;
    if (s && (["student_primary","student_middle","student_high","appassionato","researcher","moderator","admin"] as string[]).includes(s)) {
      map[s] = r.id;
    }
  }
  // sanity check minimo
  for (const s of ["student_primary","student_middle","student_high","appassionato","researcher","moderator","admin"] as PersonaSlug[]) {
    if (!map[s]) throw new Error(`Persona slug mancante in DB: ${s}`);
  }
  return map;
}

async function createUser(u: TestUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: u.display_name, persona_slug: u.persona_slug, TEST: true },
    app_metadata: { role: "test" }
  });
  if (error) throw error;
  console.log(`➕ Created auth user: ${u.email}`);
  return data.user;
}

async function upsertProfile(userId: string, email: string, displayName: string, personaId: string) {
  const payload: any = {
    id: userId,
    email,
    full_name: displayName,
    persona_id: personaId,
    is_test: true
  };
  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" }).select().single();
  if (error) throw error;
  console.log(`✅ Profile upserted: ${email}`);
}

async function main() {
  console.log("=== Seed @example.com test users (EN slugs) ===");
  await deleteExistingTargets();
  const pMap = await personaMap();

  for (const u of USERS) {
    const pid = pMap[u.persona_slug];
    const user = await createUser(u);
    await upsertProfile(user.id, u.email, u.display_name, pid);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("email, full_name, persona_id, personas:persona_id (slug)")
    .in("email", USERS.map(x => x.email));
  if (error) throw error;

  console.log("\n=== Created TEST profiles ===");
  for (const r of data ?? []) {
    const persona = Array.isArray(r.personas) ? r.personas[0] : r.personas;
    console.log(`- ${r.email} | ${r.full_name} | ${persona?.slug}`);
  }
  console.log("\n🎉 Done.");
}

main().catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); });
