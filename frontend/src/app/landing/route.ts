// src/app/landing/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "../../lib/supabaseServerClient";

export async function GET(request: Request) {
  const supabase = getServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("personas(code, default_landing_path)")
    .eq("id", user.id)
    .single();

  if (!prof?.personas?.code) {
    return NextResponse.redirect(new URL("/profile", request.url));
  }

  const code = prof.personas.code as string;
  const target = prof.personas.default_landing_path ?? `/landing/${code}`;
  return NextResponse.redirect(new URL(target, request.url));
}
