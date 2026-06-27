import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE_URL = "https://folio.ziloris.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
