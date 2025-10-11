// frontend/lib/SupabaseProvider.tsx
'use client';

import { createContext, useContext, useState } from 'react';
import { createClientComponentClient, SupabaseClient } from '@supabase/auth-helpers-nextjs';

// Context condiviso per un'unica istanza client
const SupabaseContext = createContext<SupabaseClient | null>(null);

export function useSupabaseClient() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error('useSupabaseClient must be used inside SupabaseProvider');
  return ctx;
}

export default function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabaseClient] = useState(() => createClientComponentClient());
  return (
    <SupabaseContext.Provider value={supabaseClient}>
      {children}
    </SupabaseContext.Provider>
  );
}
