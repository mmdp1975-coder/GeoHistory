import type { Metadata } from "next";
import { Suspense } from "react";
import {
  getClassroomInviteMetadataInput,
  getClassroomShareDataByToken,
} from "@/lib/classroomShare";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import InnerPage from "./page_inner";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<Metadata> {
  const resolved = await searchParams;
  const token = (resolved?.token || "").trim();
  const share = token ? await getClassroomShareDataByToken(token) : null;
  const meta = getClassroomInviteMetadataInput(token, share);

  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "website",
      url: `${meta.siteUrl}/module/classroom/invite?token=${encodeURIComponent(token)}`,
      images: [
        {
          url: meta.imageUrl,
          width: 1200,
          height: 630,
          alt: share?.title || "GeoHistory Classroom invite",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [meta.imageUrl],
    },
  };
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <InnerPage />
    </Suspense>
  );
}
