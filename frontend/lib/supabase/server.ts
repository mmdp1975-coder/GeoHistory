// frontend/lib/supabase/server.ts
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

// Factory per Server Components / Route Handlers / Server Actions
export function createServerClient() {
  return createServerComponentClient({ cookies });
}
