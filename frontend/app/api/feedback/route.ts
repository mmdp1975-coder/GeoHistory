import { NextResponse } from "next/server";
import { createClient, supabaseAdmin } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FeedbackBody = {
  source?: "support" | "rating";
  type?: "bug" | "support" | "suggestion" | "content" | "other";
  area?: "journey" | "timeline" | "quiz" | "account" | "support" | "other" | null;
  title?: string | null;
  message?: string | null;
  rating?: number | null;
  contact_email?: string | null;
  wants_reply?: boolean;
  group_event_id?: string | null;
  page_path?: string | null;
  language_code?: string | null;
  metadata?: Record<string, unknown>;
};

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asOptionalRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rating = Math.round(value);
  return rating >= 1 && rating <= 5 ? rating : null;
}

async function sendFeedbackEmail(payload: {
  source: string;
  type: string;
  area: string | null;
  title: string | null;
  message: string;
  rating: number | null;
  contact_email: string | null;
  wants_reply: boolean;
  group_event_id: string | null;
  page_path: string | null;
  language_code: string | null;
  user_id: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.FEEDBACK_NOTIFY_TO || "info@geohistory.io";

  if (!apiKey || !from) {
    console.warn("[feedback] Email notification skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL");
    return;
  }

  const subject = [
    "[GeoHistory feedback]",
    payload.source,
    payload.type,
    payload.area || "no-area",
  ].join(" | ");

  const text = [
    `Source: ${payload.source}`,
    `Type: ${payload.type}`,
    `Area: ${payload.area ?? "-"}`,
    `Title: ${payload.title ?? "-"}`,
    `Rating: ${payload.rating ?? "-"}`,
    `Wants reply: ${payload.wants_reply ? "yes" : "no"}`,
    `Contact email: ${payload.contact_email ?? "-"}`,
    `User id: ${payload.user_id ?? "-"}`,
    `Journey id: ${payload.group_event_id ?? "-"}`,
    `Page path: ${payload.page_path ?? "-"}`,
    `Language: ${payload.language_code ?? "-"}`,
    "",
    "Message:",
    payload.message,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      reply_to: payload.contact_email || undefined,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend email failed: ${res.status} ${errText}`.trim());
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as FeedbackBody;
    const source = body.source === "rating" ? "rating" : "support";
    const type = body.type ?? "other";
    const area = body.area ?? null;
    const title = asTrimmedString(body.title);
    const message = asTrimmedString(body.message);
    const rating = asOptionalRating(body.rating);
    const contactEmail = asTrimmedString(body.contact_email);
    const wantsReply = !!body.wants_reply;
    const groupEventId = asTrimmedString(body.group_event_id);
    const pagePath = asTrimmedString(body.page_path);
    const languageCode = asTrimmedString(body.language_code);
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const insertPayload = {
      user_id: user?.id ?? null,
      source,
      type,
      area,
      title,
      message,
      rating,
      contact_email: contactEmail,
      wants_reply: wantsReply,
      group_event_id: groupEventId,
      page_path: pagePath,
      language_code: languageCode,
      metadata,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("user_feedback")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      await sendFeedbackEmail({
        ...insertPayload,
        user_id: user?.id ?? null,
      });
    } catch (emailError: any) {
      console.warn("[feedback] notification email failed:", emailError?.message || emailError);
    }

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
