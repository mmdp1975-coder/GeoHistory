// src/lib/supabaseClient.ts
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./types"; // opzionale: se hai i tipi Supabase, altrimenti cambia in 'any'

export const supabase = createClientComponentClient<Database>();
