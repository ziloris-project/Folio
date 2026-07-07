import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://folio.ziloris.com";
const TITLE = "Folio — Edit PDFs. No limits. Free.";
const DESCRIPTION =
  "Folio is a free, no-limits PDF editor that runs entirely in your browser. Edit text, sign, add images and shapes, reorder pages, then export — no account, no watermark, nothing uploaded.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Folio",
  },
  description: DESCRIPTION,
  applicationName: "Folio",
  generator: "Next.js",
  keywords: [
    "PDF editor",
    "free PDF editor",
    "edit PDF online",
    "edit PDF free",
    "sign PDF",
    "PDF annotator",
    "browser PDF editor",
    "no watermark PDF editor",
    "client-side PDF editor",
    "reorder PDF pages",
    "fill out PDF",
    "open source PDF editor",
  ],
  authors: [{ name: "Ziloris", url: "https://ziloris.com" }],
  creator: "Ziloris",
  publisher: "Ziloris",
  category: "productivity",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Folio",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "A free, no-limits PDF editor that runs entirely in your browser. No account, no watermark, nothing uploaded.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#06060a",
  colorScheme: "dark",
};

// Structured data so search engines understand Folio is a free web app.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Folio",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any (web browser)",
  description: DESCRIPTION,
  browserRequirements: "Requires a modern browser with WebAssembly support.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  publisher: {
    "@type": "Organization",
    name: "Ziloris",
    url: "https://ziloris.com",
  },
  featureList: [
    "Edit existing PDF text",
    "Add text, images, shapes and signatures",
    "Reorder, rotate and delete pages",
    "Export edited PDFs",
    "Runs entirely client-side — no upload",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
