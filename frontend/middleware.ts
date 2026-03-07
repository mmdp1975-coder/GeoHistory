// frontend/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  const res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|assets/).*)'],
};
