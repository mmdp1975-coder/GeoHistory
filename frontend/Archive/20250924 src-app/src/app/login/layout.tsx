// src/app/login/layout.tsx
// Server Component: evita il flash nascondendo l'app mappa a livello SSR.
export const metadata = { title: "Login – GeoHistory" };

import "./login.module.css"; // carica i CSS della login lato server (niente flash)

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style
        // nasconde TUTTI i layer della mappa/overlay PRIMA dell'idratazione
        dangerouslySetInnerHTML={{
          __html: `
            .gh-app,
            .gh-header,
            .gh-time,
            .gh-main,
            .gh-details,
            .gh-bottomsheet,
            .gh-readerbar,
            .gh-overlay,
            .gh-sheet,
            .gh-fab,
            .leaflet-container {
              display: none !important;
            }
          `,
        }}
      />
      {children}
    </>
  );
}
