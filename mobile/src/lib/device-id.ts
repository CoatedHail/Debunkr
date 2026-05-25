import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'credibility-check.device-id';

function uuidv4(): string {
  // RFC4122 v4 fallback that works in React Native (no Node crypto module).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  // SecureStore is unavailable on web; fall back to in-memory.
  if (Platform.OS === 'web') {
    cached = uuidv4();
    return cached;
  }

  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) {
    cached = existing;
    return existing;
  }

  const fresh = uuidv4();
  await SecureStore.setItemAsync(KEY, fresh);
  cached = fresh;
  return fresh;
}
