export function extractLoginToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return parsed.searchParams.get("loginToken") || parsed.searchParams.get("token") || parsed.searchParams.get("t");
  } catch {
    return trimmed;
  }
}

export function inferApiBaseUrlFromLink(value: string) {
  try {
    const parsed = new URL(value.trim());
    if (!parsed.protocol.startsWith("http")) return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}
