// frontend/app/about/layout.tsx
import TopBar from "../components/TopBar";

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <TopBar />
      {children}
    </div>
  );
}
