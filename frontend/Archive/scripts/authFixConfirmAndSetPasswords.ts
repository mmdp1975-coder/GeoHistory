/**
 * Conferma i 7 utenti di test e imposta la password "Password123!"
 * (senza ricrearli). Se erano bannati, rimuove il ban.
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Password123!";
const EMAILS = [
  "test_student_elementari@example.com",
  "test_student_medie@example.com",
  "test_student_superiori@example.com",
  "test_appassionato@example.com",
  "test_researcher@example.com",
  "test_moderator@example.com",
  "test_admin@example.com",
];

async function listAllUsers() {
  const perPage = 1000;
  let page = 1;
  let all: any[] = [];
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users ?? [];
    all = all.concat(batch);
    if (batch.length < perPage) break;
    page++;
  }
  return all;
}

async function main() {
  console.log("=== Fix auth: confirm & set passwords ===");
  const all = await listAllUsers();

  for (const email of EMAILS) {
    const user = all.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      console.log(`⚠️  Non trovato in auth: ${email} (lo saltiamo)`);
      continue;
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      password: PASSWORD,
      // se l'utente fosse bannato, 'none' rimuove il ban
      ban_duration: "none",
    });
    if (error) throw error;

    console.log(`✅ Aggiornato: ${email} (confirmed + password impostata)`);
  }

  console.log("\n🎉 Done.");
}

main().catch((e) => {
  console.error("❌ Fix failed:", e);
  process.exit(1);
});
