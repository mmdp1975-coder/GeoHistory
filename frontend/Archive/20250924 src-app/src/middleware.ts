import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const redirects: Record<string, string> = {
  "/explorer": "/explore",   // <— assicurati che ci sia
  "/student/home": "/dashboard/student",
  "/students/high": "/dashboard/student",
  "/students/middle": "/dashboard/student",
  "/students/primary": "/dashboard/student",
  "/fan": "/dashboard/enthusiast",
  "/research": "/dashboard/researcher",
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const to = redirects[pathname];
  if (to) return NextResponse.redirect(new URL(to, req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
