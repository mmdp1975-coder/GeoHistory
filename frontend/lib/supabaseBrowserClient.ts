// frontend/lib/supabaseBrowserClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Legge le variabili d'ambiente pubbliche (devono essere valorizzate)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fail-fast chiaro in dev: evita comportamenti silenziosi se mancano le env
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Add them to your .env.local'
  );
}

// Crea un client browser con gestione sessione persistente
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Esporta anche come default per compatibilità con import esistenti
export default supabase;
