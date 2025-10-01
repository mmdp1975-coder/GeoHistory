// frontend/app/module/group_event/page.tsx
import { Suspense } from "react";

// Evita il prerender statico (runtime dinamico).
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Importa il vero componente client (il tuo vecchio page.tsx rinominato)
import InnerPage from "./page_inner";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <InnerPage />
    </Suspense>
  );
}
