// frontend/app/sitemap.ts

import type { MetadataRoute } from "next";

/**
 * Simple sitemap for GeoHistory.
 * Next.js will automatically serve this as /sitemap.xml
 */
const BASE_URL = "https://geohistory.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const today = new Date().toISOString().split("T")[0]; // formato YYYY-MM-DD

  return [
    {
      url: BASE_URL,
      lastModified: today,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
