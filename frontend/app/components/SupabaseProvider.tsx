// frontend/app/components/SupabaseProvider.tsx
'use client';

import { useMemo } from 'react';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  return <SessionContextProvider supabaseClient={supabase}>{children}</SessionContextProvider>;
}
