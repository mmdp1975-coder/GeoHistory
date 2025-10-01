// app/api/diag/ping/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, where: "app/api/diag/ping/route.ts" });
}
