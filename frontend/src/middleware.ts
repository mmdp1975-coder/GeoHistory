// src/middleware.ts
import { NextResponse, NextRequest } from "next/server";

/* 🔁 copia qui gli stessi mapping usati in postLoginRedirect.ts */
const LEGACY_TO_NEW: Record<string, string> = {
  "/student": "/student/home",
  "/students": "/student/home",
  "/student/primary": "/student/home",
  "/students/primary": "/student/home",
  "/student-elementary": "/student/home",
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const key = pathname.replace(/\/+$/, "");
  const target = LEGACY_TO_NEW[key];

  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/student",
    "/students",
    "/student/primary",
    "/students/primary",
    "/student-elementary",
  ],
};
