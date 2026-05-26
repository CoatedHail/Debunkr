import { createHash } from 'node:crypto';
import type { JobResult } from '../types/api.js';

// Hash only the first 4 000 chars so that minor trailing edits (ads, timestamps)
// don't bust the cache for otherwise identical article bodies.
export function articleTextHash(text: string): string {
  return createHash('sha256').update(text.slice(0, 4000)).digest('hex');
}

const NEWS_PATTERNS = [/\/news\//i, /\/202[0-9]\//, /\/articles?\//i];

export function ttlForUrl(url: string): number {
  if (NEWS_PATTERNS.some(re => re.test(url))) return 3600;
  return 86_400;
}

function key(url: string, hash: string): string {
  return `${url}|${hash}`;
}

interface Entry {
  value: JobResult;
  expiresAt: number;
}

export interface Cache {
  get(url: string, hash: string): JobResult | undefined;
  set(url: string, hash: string, value: JobResult, ttlSeconds: number): void;
}

export function createCache(): Cache {
  const map = new Map<string, Entry>();
  return {
    get(url, hash) {
      const entry = map.get(key(url, hash));
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        map.delete(key(url, hash));
        return undefined;
      }
      return entry.value;
    },
    set(url, hash, value, ttlSeconds) {
      map.set(key(url, hash), {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000
      });
    }
  };
}
