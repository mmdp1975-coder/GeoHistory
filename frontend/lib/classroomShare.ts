import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ClassroomShareData = {
  classroomId: string;
  title: string;
  description: string | null;
  accessMode: string;
  coverUrls: string[];
};

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function toAbsoluteCoverUrl(raw?: string | null) {
  const value = (raw || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.replace(/\\/g, "/");
  const publicSplit = normalized.split("/public/");
  const relative = publicSplit.length > 1 && publicSplit[1] ? `/${publicSplit[1]}` : normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${getSiteUrl()}${encodeURI(relative)}`;
}

export async function getClassroomShareDataByToken(
  token: string
): Promise<ClassroomShareData | null> {
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("classroom_invites")
    .select("classroom_id, active")
    .eq("token", cleanToken)
    .eq("active", true)
    .maybeSingle();

  if (inviteError || !invite?.classroom_id) return null;

  const classroomId = String(invite.classroom_id);

  const { data: classroom, error: classroomError } = await supabaseAdmin
    .from("classrooms")
    .select("id, title, description, access_mode")
    .eq("id", classroomId)
    .maybeSingle();

  if (classroomError || !classroom?.id) return null;

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("classroom_journeys")
    .select("group_event_id, sort_order, assigned_at")
    .eq("classroom_id", classroomId)
    .order("sort_order", { ascending: true })
    .order("assigned_at", { ascending: true })
    .limit(4);

  if (assignmentError || !assignments?.length) {
    return {
      classroomId,
      title: classroom.title,
      description: classroom.description,
      accessMode: classroom.access_mode,
      coverUrls: [],
    };
  }

  const orderedIds = assignments.map((row) => String(row.group_event_id));
  const { data: journeys } = await supabaseAdmin
    .from("v_journeys")
    .select("journey_id, journey_cover_url")
    .in("journey_id", orderedIds);

  const coverById = new Map(
    (journeys || []).map((row: any) => [String(row.journey_id), toAbsoluteCoverUrl(row.journey_cover_url)])
  );

  const coverUrls = orderedIds
    .map((id) => coverById.get(id))
    .filter((url): url is string => !!url);

  return {
    classroomId,
    title: classroom.title,
    description: classroom.description,
    accessMode: classroom.access_mode,
    coverUrls,
  };
}

export function getClassroomInviteMetadataInput(
  token: string,
  data: ClassroomShareData | null
) {
  const siteUrl = getSiteUrl();
  if (!data) {
    return {
      siteUrl,
      title: "GeoHistory Classroom",
      description: "Join a GeoHistory classroom through an invite link.",
      imageUrl: `${siteUrl}/og-geohistory.jpg`,
    };
  }

  const title = `${data.title} | GeoHistory Classroom`;
  const description =
    data.description?.trim() ||
    `Join this ${data.accessMode} GeoHistory classroom and explore its assigned journeys.`;

  return {
    siteUrl,
    title,
    description,
    imageUrl: `${siteUrl}/api/classroom/invite-image?token=${encodeURIComponent(token)}`,
  };
}
