// frontend/app/api/profile/update/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) return new NextResponse(userErr.message, { status: 401 });
    if (!user)   return new NextResponse('Not authenticated', { status: 401 });

    const body = await req.json();
    const language_code: string | null = body?.language_code ?? null;
    const persona_id: string | null = body?.persona_id ?? null;

    // Validazione lingua: "it" | "en" (estendibile: xx o xx-YY)
    const langOk =
      language_code === null ||
      /^[a-z]{2}(-[A-Z]{2})?$/.test(language_code);

    if (!langOk) {
      return new NextResponse('Invalid language_code', { status: 400 });
    }

    // Se persona_id è passato, deve esistere
    if (persona_id) {
      const { data: persona, error: pErr } = await supabase
        .from('personas')
        .select('id')
        .eq('id', persona_id)
        .single();

      if (pErr || !persona) {
        return new NextResponse('persona_id not found', { status: 400 });
      }
    }

    const { error: uErr } = await supabase
      .from('profiles')
      .update({
        language_code: language_code,
        persona_id: persona_id,
      })
      .eq('id', user.id);

    if (uErr) {
      return new NextResponse(uErr.message, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e?.message || 'Server error', { status: 500 });
  }
}
