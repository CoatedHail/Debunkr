const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function isValidUrl(input: string): boolean {
  if (typeof input !== 'string' || input.length === 0) {
    return false;
  }
  try {
    const parsed = new URL(input);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return false;
    }
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
