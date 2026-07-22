/**
 * i18n plumbing for Debunkr v1.4.
 *
 * On first launch we auto-detect the device locale via expo-localization and
 * pick `zh-Hans` if it's any Chinese variant, otherwise `en`. The user can
 * override this from the language modal in the header; the override is
 * persisted in expo-secure-store under `sift.locale` and reloaded on the
 * next launch.
 *
 * The rest of the app should read `i18n.t(...)` and re-render when the
 * language changes by subscribing to `onLocaleChange`.
 */
import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import en from '../i18n/en.json';
import zhHans from '../i18n/zh-Hans.json';

export type SupportedLocale = 'en' | 'zh-Hans';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'zh-Hans'];

const LOCALE_STORAGE_KEY = 'sift.locale';

// Set the default locale on the shared instance so components can render
// immediately with the device locale while the persisted override is loaded
// asynchronously. We don't gate the first render on SecureStore.
export const i18n = new I18n(
  { en, 'zh-Hans': zhHans },
  {
    defaultLocale: 'en',
    // Silent fallback when a key is missing in the active locale — English
    // strings act as the source of truth.
    enableFallback: true
  }
);

/**
 * Detect the device's UI language via expo-localization and normalize it to
 * one of the SUPPORTED_LOCALES codes. Anything under the Chinese language
 * family (zh, zh-Hans, zh-CN, zh-SG, zh-Hant, zh-TW, zh-HK, …) collapses to
 * `zh-Hans` today; everything else falls back to `en`.
 */
export function detectDeviceLocale(): SupportedLocale {
  try {
    const locales = Localization.getLocales();
    const first = Array.isArray(locales) && locales.length > 0 ? locales[0] : null;
    const tag = (first?.languageTag ?? first?.languageCode ?? '').toLowerCase();
    if (tag.startsWith('zh')) return 'zh-Hans';
    return 'en';
  } catch {
    return 'en';
  }
}

type Listener = (locale: SupportedLocale) => void;
const listeners = new Set<Listener>();

/** Subscribe to locale changes. Returns an unsubscribe function. */
export function onLocaleChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Currently active locale. */
export function currentLocale(): SupportedLocale {
  const raw = i18n.locale;
  if (raw === 'zh-Hans') return 'zh-Hans';
  return 'en';
}

/**
 * Apply a locale to the shared i18n instance and notify listeners.
 * Only accepts SUPPORTED_LOCALES; anything else is silently coerced to `en`.
 */
function applyLocale(next: SupportedLocale): void {
  const normalized: SupportedLocale = SUPPORTED_LOCALES.includes(next) ? next : 'en';
  i18n.locale = normalized;
  listeners.forEach((l) => l(normalized));
}

/**
 * Boot sequence: load the persisted override (if any), fall back to device
 * locale otherwise, and apply it. Call this once at app startup.
 */
export async function initializeLocale(): Promise<SupportedLocale> {
  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(LOCALE_STORAGE_KEY);
  } catch {
    // SecureStore can fail (e.g. keychain access denied) — fall through to
    // device locale so the app still renders.
    stored = null;
  }
  const initial: SupportedLocale =
    stored === 'en' || stored === 'zh-Hans' ? stored : detectDeviceLocale();
  applyLocale(initial);
  return initial;
}

/**
 * Persist a manual language choice and switch immediately.
 * Silent-fail on SecureStore errors — the in-memory locale still updates so
 * the UI reflects the user's choice for the remainder of the session.
 */
export async function setLocale(next: SupportedLocale): Promise<void> {
  applyLocale(next);
  try {
    await SecureStore.setItemAsync(LOCALE_STORAGE_KEY, next);
  } catch {
    // ignore
  }
}

/** Convenience: `t('foo.bar', { param: 'x' })` matches i18n.t signature. */
export function t(key: string, params?: Record<string, unknown>): string {
  return i18n.t(key, params);
}
