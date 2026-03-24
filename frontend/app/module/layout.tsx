// frontend/app/module/layout.tsx
'use client';

import TopBar from '../components/TopBar';

export default function ModuleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-transparent text-slate-900">
      <TopBar />
      {children}
    </div>
  );
}
