import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE_URL = "https://folio.ziloris.com";

// Single-page app - one canonical URL. Fixed lastModified so the sitemap
// stays stable between builds (bump when the landing meaningfully changes).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date("2026-06-27"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
