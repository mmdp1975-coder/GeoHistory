export function normalizeRedirectPath(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}
