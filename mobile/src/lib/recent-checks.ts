import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { OverallBucket } from '../types/api';

const KEY = 'credibility-check.recent-checks';
const MAX_ENTRIES = 5;

export interface RecentCheck {
  url: string;
  title: string;
  overall: number;
  bucket: OverallBucket;
  checkedAt: string; // ISO
}

// In-memory fallback for web (SecureStore is unavailable there) and as a cache.
let memoryCache: RecentCheck[] | null = null;

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function writeRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(KEY, value);
  } catch {
    // best-effort persistence
  }
}

export async function loadRecentChecks(): Promise<RecentCheck[]> {
  if (memoryCache) return memoryCache;
  const raw = await readRaw();
  if (!raw) {
    memoryCache = [];
    return memoryCache;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryCache = parsed
        .filter(
          (e): e is RecentCheck =>
            !!e &&
            typeof e.url === 'string' &&
            typeof e.title === 'string' &&
            typeof e.overall === 'number' &&
            typeof e.bucket === 'string' &&
            typeof e.checkedAt === 'string'
        )
        .slice(0, MAX_ENTRIES);
      return memoryCache;
    }
  } catch {
    // fall through
  }
  memoryCache = [];
  return memoryCache;
}

export async function pushRecentCheck(entry: RecentCheck): Promise<RecentCheck[]> {
  const current = await loadRecentChecks();
  // De-dupe by URL — newest wins.
  const filtered = current.filter((e) => e.url !== entry.url);
  const next = [entry, ...filtered].slice(0, MAX_ENTRIES);
  memoryCache = next;
  await writeRaw(JSON.stringify(next));
  return next;
}
