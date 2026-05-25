import { parse } from 'tldts';

const KNOWN_SHORTENERS = new Set([
  't.co',
  'bit.ly',
  'goo.gl',
  'tinyurl.com',
  'ow.ly',
  'buff.ly',
  'lnkd.in',
  'is.gd',
  'tiny.cc',
  'short.io',
  'rebrand.ly'
]);

/**
 * Return the registrable domain for a URL, lowercased.
 * Strips www/m/amp/mobile subdomains via tldts public-suffix logic.
 * Returns null for invalid URLs or IP-host URLs.
 */
export function canonicalDomain(url: string): string | null {
  const result = parse(url);
  if (!result.domain) return null;
  if (result.isIp) return null;
  return result.domain.toLowerCase();
}

/**
 * Detect URL shorteners. Caller should resolve redirects before dataset lookup
 * when this returns true — `t.co/abc` is not a publisher, it's a redirect host.
 */
export function isKnownShortener(host: string): boolean {
  return KNOWN_SHORTENERS.has(host.toLowerCase());
}
