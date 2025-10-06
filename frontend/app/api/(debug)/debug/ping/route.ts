import { NextResponse } from "next/server";
import { ensureDebugAccess } from "@/lib/debug/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await ensureDebugAccess(req);
  if (!guard.ok) return guard.response;

  return NextResponse.json({
    ok: true,
    where: "app/api/(debug)/debug/ping",
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || null,
    userId: guard.userId ?? null,
  });
}
