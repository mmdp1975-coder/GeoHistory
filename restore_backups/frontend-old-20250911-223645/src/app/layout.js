export const metadata = { title: "GeoHistory" };

import "../styles/globals.css";
import "leaflet/dist/leaflet.css";

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="gh-body">{children}</body>
    </html>
  );
}
