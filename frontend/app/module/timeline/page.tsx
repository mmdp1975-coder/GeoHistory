// frontend/app/module/timeline/page.tsx
import { Suspense } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import InnerPage from "./page_inner";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <InnerPage />
    </Suspense>
  );
}
