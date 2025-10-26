// frontend/app/api/profile/update/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

type Body = {
  language_code?: string | null; // 'it' | 'en' | null
  persona_id?: string | null;    // opzionale
};

// helper
const isPrivilegedCode = (code?: string | null) => {
  const u = (code || '').trim().toUpperCase();
  return u.startsWith('ADMIN') || u.startsWith('MOD');
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const body = (await req.json()) as Body;
    const lang = (body.language_code ?? null) as string | null;
    const targetPersonaId = (body.persona_id ?? null) as string | null;

    // 1) utente
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: authErr?.message || 'Unauthorized' }, { status: 401 });
    }

    // 2) profilo corrente
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('id, language_code, persona_id')
      .eq('id', user.id)
      .single();

    if (profErr || !prof) {
      return NextResponse.json({ error: profErr?.message || 'Profile not found' }, { status: 404 });
    }

    const currentPersonaId = prof.persona_id as string | null;

    // 3) recupero persona corrente per capire se l’utente è privilegiato
    let currentPersonaCode: string | null = null;
    if (currentPersonaId) {
      const { data: currP, error: currPErr } = await supabase
        .from('personas')
        .select('id, code')
        .eq('id', currentPersonaId)
        .single();

      if (!currPErr && currP) {
        currentPersonaCode = currP.code ?? null;
      }
    }
    const userIsPrivileged = isPrivilegedCode(currentPersonaCode);

    // 4) calcolo la persona da salvare con regole robuste
    //    - ADMIN/MOD: persona SEMPRE forzata a quella corrente
    //    - NON privilegiati: se target è privilegiata -> IGNORA e usa la corrente
    //    - se target è null/undefined -> usa la corrente (non cambiare)
    let personaIdToSave: string | null = currentPersonaId;
    if (!userIsPrivileged) {
      if (targetPersonaId) {
        // guardo il codice della persona target
        const { data: targetP } = await supabase
          .from('personas')
          .select('id, code')
          .eq('id', targetPersonaId)
          .single();

        const targetPriv = isPrivilegedCode(targetP?.code ?? null);
        personaIdToSave = targetPriv ? currentPersonaId : targetPersonaId;
      }
      // se targetPersonaId è null/undefined -> lascio currentPersonaId
    }
    // se userIsPrivileged -> personaIdToSave resta currentPersonaId

    // 5) aggiorno il profilo: la lingua è SEMPRE salvabile
    const updatePayload: { language_code?: string | null; persona_id?: string | null } = {
      language_code: lang,
      persona_id: personaIdToSave,
    };

    const { error: upErr } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id);

    if (upErr) {
      // Nota: qui NON usiamo messaggi "ruoli privilegiati…" per non confondere quando si salva solo la lingua
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, language_code: lang, persona_id: personaIdToSave });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
