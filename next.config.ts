import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The editor is a browser-only "use client" island loaded with ssr:false, so
  // the heavy libs (PDFium-WASM, pdf-lib) never enter the server bundle.
  // The PDFium wasm binary is served as a static asset from /public and fetched
  // at runtime (see lib/pdf/pdfium/runtime.ts), so no bundler wasm rule is
  // needed. Turbopack is the default bundler in Next 16.

  // Because there is no server work, we emit a fully static site to ./out and
  // serve it from Cloudflare as static assets (see wrangler.jsonc + `npm run
  // deploy`).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
