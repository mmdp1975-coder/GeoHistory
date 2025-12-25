// frontend/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import SupabaseProvider from "./components/SupabaseProvider";
import IdleLogoutProvider from "./components/IdleLogoutProvider";

const siteUrl = "https://geohistory.io";
const title = "GeoHistory – Where time and space turn into stories";
const description =
  "GeoHistory is the interactive platform where time and space turn into stories. Explore world history on a live map and timeline, discover events, civilizations and journeys designed for students, teachers and history lovers.";
const ogImageUrl = `${siteUrl}/og-geohistory.jpg`; // solo logo, quadrato

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
        url: ogImageUrl,
        width: 800,   // quadrato: adatta al file che hai creato
        height: 800,
        alt: "GeoHistory logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImageUrl],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased" suppressHydrationWarning>
        <SupabaseProvider>
          <IdleLogoutProvider>{children}</IdleLogoutProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
