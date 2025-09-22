// src/app/layout.tsx
export const metadata = { title: "GeoHistory" };

import "../styles/globals.css";
import "leaflet/dist/leaflet.css";
import { headers } from "next/headers";

export default function RootLayout({ children }) {
  const h = headers();
  const pathname = h.get("x-invoke-path") || ""; // fallback

  // Se siamo su /login, tolgo la classe "gh-body" (sospetto che applichi la mappa globale)
  const bodyClass = pathname.startsWith("/login") ? "" : "gh-body";

  return (
    <html lang="it">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={bodyClass}>{children}</body>
    </html>
  );
}
