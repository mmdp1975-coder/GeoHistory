import { redirect } from "next/navigation";

export default function ResetPasswordRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // Ricostruisce la query string così com'è e inoltra al percorso corretto.
  const query = new URLSearchParams();
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (typeof value === "string") query.append(key, value);
    else if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
  });
  const qs = query.toString();
  redirect(`/login/reset_password${qs ? `?${qs}` : ""}`);
}
