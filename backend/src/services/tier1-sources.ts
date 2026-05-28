import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'tldts';
import { canonicalDomain } from './canonical-domain.js';

// Resolve data directory robustly for both tsx (ESM) and ts-jest (CJS).
// jest runs with cwd = backend/; tsx dev server runs from backend/ too.
const DATA_DIR = path.resolve(process.cwd(), 'src', 'data');

let cached: Set<string> | null = null;

/**
 * Load the tier-1 source allowlist. Single-column CSV (no header), one domain
 * per line. Blank lines skipped. Result is cached at module level.
 */
export function loadTier1Domains(): Set<string> {
  if (cached) return cached;
  const text = readFileSync(path.join(DATA_DIR, 'tier1-sources.csv'), 'utf-8');
  const set = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (!line) continue;
    set.add(line);
  }
  cached = set;
  return set;
}

/**
 * Returns true iff the input (a hostname like `www.reuters.com` or a full URL
 * like `https://www.bbc.co.uk/news/article`) resolves to a tier-1 publisher.
 * Subdomains are normalized via canonicalDomain() (tldts eTLD+1).
 */
export function isTier1(domain: string): boolean {
  if (!domain) return false;
  const set = loadTier1Domains();

  // Resolve hostname via tldts (handles both full URLs and bare hostnames).
  const parsed = parse(domain) ?? parse(`https://${domain}`);
  const hostname = parsed?.hostname?.toLowerCase() ?? null;

  // Walk subdomain levels (e.g. www.abcnews.go.com → abcnews.go.com → go.com)
  // so that entries like `abcnews.go.com` match even though canonicalDomain()
  // would collapse to the eTLD+1 `go.com`.
  if (hostname) {
    const parts = hostname.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join('.');
      if (set.has(candidate)) return true;
    }
  }

  // Final fallback: tldts eTLD+1 (covers e.g. bare-domain inputs cleanly).
  const canonical = canonicalDomain(domain) ?? canonicalDomain(`https://${domain}`);
  if (canonical && set.has(canonical)) return true;

  return false;
}
