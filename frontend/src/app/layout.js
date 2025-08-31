export const metadata = { title: "GeoHistory Journey" };

import "../styles/globals.css";
import "leaflet/dist/leaflet.css";

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
