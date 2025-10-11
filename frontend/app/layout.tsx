// frontend/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import SupabaseProvider from "@/lib/SupabaseProvider";

export const metadata: Metadata = {
  title: "GeoHistory Journey",
  description: "Where time and space turn into stories",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
    </html>
  );
}
