// src/components/RoleBadge.tsx
import React from "react";

type Role = "student" | "researcher" | "enthusiast" | "moderator" | "admin";

const roleMap: Record<Role, { emoji: string; color: string; label: string }> = {
  student:     { emoji: "🎓", color: "bg-emerald-600", label: "Student" },
  researcher:  { emoji: "🔬", color: "bg-blue-600",    label: "Researcher" },
  enthusiast:  { emoji: "⭐", color: "bg-amber-500",    label: "Enthusiast" },
  moderator:   { emoji: "🛡️", color: "bg-slate-600",   label: "Moderator" },
  admin:       { emoji: "⚙️", color: "bg-indigo-900",  label: "Admin" },
};

export default function RoleBadge({ role }: { role: Role }) {
  const cfg = roleMap[role] ?? roleMap.student;
  return (
    <span className={`${cfg.color} text-white text-xs px-2 py-1 rounded-full`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}
