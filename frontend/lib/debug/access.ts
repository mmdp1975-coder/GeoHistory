import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/adminAuth";

export type DebugGuardResult =
  | { ok: true; userId?: string }
  | { ok: false; response: NextResponse };

export async function ensureDebugAccess(req: Request): Promise<DebugGuardResult> {
  if (process.env.NODE_ENV !== "production") {
    return { ok: true };
  }

  const guard = await requireAdmin(req);
  if (!guard.ok) {
    return { ok: false, response: guard.response };
  }

  return { ok: true, userId: guard.userId };
}
