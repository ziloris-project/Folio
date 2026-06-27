import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Web app manifest — lets Folio be installed/added to home screen and gives
// Lighthouse/PWA crawlers the icons and theme they look for.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Folio — PDF Editor",
    short_name: "Folio",
    description:
      "A free, no-limits PDF editor that runs entirely in your browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#06060a",
    theme_color: "#06060a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
