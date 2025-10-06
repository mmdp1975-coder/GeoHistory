// frontend/app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GeoHistory Journey",
  description: "Where time and space turn into stories",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
