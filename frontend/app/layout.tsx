// frontend/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import SupabaseProvider from "./components/SupabaseProvider";
import IdleLogoutProvider from "./components/IdleLogoutProvider";

const siteUrl = "https://geohistory.io";
const title = "GeoHistory – Where time and space turn into stories";
const description =
  "GeoHistory is the interactive platform where time and space turn into stories. Explore world history on a live map and timeline, discover events, civilizations and journeys designed for students, teachers and history lovers.";
const ogImageUrl = `${siteUrl}/og-geohistory.jpg`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "GeoHistory",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: ogImageUrl, // URL ASSOLUTO, non relativo
        width: 1200,
        height: 630,
        alt: "GeoHistory – Where time and space turn into stories",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImageUrl], // URL ASSOLUTO
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <SupabaseProvider>
          <IdleLogoutProvider>{children}</IdleLogoutProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
