// frontend/lib/supabase/client.ts
'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Factory per componenti Client ('use client')
export function createClient() {
  return createClientComponentClient();
}
