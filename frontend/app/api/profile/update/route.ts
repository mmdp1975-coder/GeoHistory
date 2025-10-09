// frontend/app/api/profile/update/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

type Body = {
  language_code?: string | null;
  persona_id?: string | null;
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  // 1) Autenticazione
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return new NextResponse(authErr?.message || 'Unauthorized', { status: 401 });
  }

  // 2) Parse body
  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return new NextResponse('Invalid JSON body', { status: 400 });
  }

  const language_code =
    typeof payload.language_code === 'string' && payload.language_code.trim() !== ''
      ? payload.language_code.trim()
      : null;

  const requested_persona_id =
    typeof payload.persona_id === 'string' && payload.persona_id.trim() !== ''
      ? payload.persona_id.trim()
      : null;

  // 3) Profilo corrente + persona corrente (code)
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, persona_id')
    .eq('id', user.id)
    .single();

  if (profErr || !profile) {
    return new NextResponse(profErr?.message || 'Profile not found', { status: 404 });
  }

  let currentPersonaCode: string | null = null;
  if (profile.persona_id) {
    const { data: curPersona, error: curPErr } = await supabase
      .from('personas')
      .select('code')
      .eq('id', profile.persona_id)
      .single();
    if (curPErr) {
      return new NextResponse(curPErr.message, { status: 500 });
    }
    currentPersonaCode = (curPersona?.code || null)?.toUpperCase() || null;
  }

  const isAdmin = currentPersonaCode === 'ADMIN';
  const isModerator = currentPersonaCode === 'MODERATOR';

  // 4) Se è stata richiesta una modifica persona, validiamo
  let targetPersonaIdToApply: string | null = null;

  if (requested_persona_id !== null) {
    // recupero persona target per leggerne il code
    const { data: targetPersona, error: tgtErr } = await supabase
      .from('personas')
      .select('id, code')
      .eq('id', requested_persona_id)
      .single();

    if (tgtErr || !targetPersona) {
      return new NextResponse('Requested persona not found', { status: 400 });
    }

    const targetCode = (targetPersona.code || '').toUpperCase();

    // Regole:
    // A) Nessuno può auto-assegnarsi ADMIN o MODERATOR
    if (targetCode === 'ADMIN' || targetCode === 'MODERATOR') {
      return new NextResponse(
        'Non puoi selezionare ruoli privilegiati (ADMIN/MODERATOR) da questa pagina.',
        { status: 403 }
      );
    }

    // B) Un MODERATOR non può diventare ADMIN
    if (isModerator && targetCode === 'ADMIN') {
      return new NextResponse('Un MODERATOR non può diventare ADMIN.', { status: 403 });
    }

    // C) Se sei già ADMIN o MODERATOR, non puoi cambiare persona da questo endpoint
    if (isAdmin || isModerator) {
      return new NextResponse(
        'Il tuo ruolo è gestito dagli amministratori. Modifiche persona non consentite da questa pagina.',
        { status: 403 }
      );
    }

    // Se passate tutte le regole, si può applicare la nuova persona
    targetPersonaIdToApply = targetPersona.id;
  }

  // 5) Costruzione update
  const updates: Record<string, any> = {};
  if (language_code !== null) updates.language_code = language_code;

  if (requested_persona_id !== null) {
    // applica solo se è stata validata una persona diversa da ADMIN/MODERATOR
    updates.persona_id = targetPersonaIdToApply;
  }

  // Se non c'è nulla da aggiornare, ritorna OK
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, message: 'Nothing to update' });
  }

  // 6) Update profilo (solo il proprio)
  const { error: updErr } = await supabase.from('profiles').update(updates).eq('id', user.id);

  if (updErr) {
    return new NextResponse(updErr.message || 'Update failed', { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Impostazioni salvate correttamente.' });
}
