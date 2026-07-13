export type EntityCheck = {
  name: string;
  exists: boolean;
  isDisambiguation: boolean;
  extract?: string; // first paragraph, present only when exists && !isDisambiguation
  pageUrl?: string; // present only when exists
};

export type WikipediaOptions = {
  fetchFn?: typeof fetch;
  timeoutMs?: number; // default 3000
  /**
   * IETF language tag (or bare Wikipedia subdomain code, e.g. "zh", "zh-Hans",
   * "en", "en-US"). When it starts with "zh" we query zh.wikipedia.org first
   * and fall back to en.wikipedia.org on 404. Any other value (or unset)
   * hits en.wikipedia.org directly.
   */
  locale?: string;
};

const ENGLISH_HOST = 'en.wikipedia.org';
const CHINESE_HOST = 'zh.wikipedia.org';
const REST_PATH = '/api/rest_v1/page/summary/';
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_ENTITIES = 5;
const USER_AGENT = 'FakeNewsDetector/1.0 (fact-check pipeline)';

type RawSummary = {
  type?: string;
  extract?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
};

type FetchOutcome =
  | { kind: 'notFound' }
  | { kind: 'error' }
  | { kind: 'ok'; data: RawSummary };

function notFound(name: string): EntityCheck {
  return { name, exists: false, isDisambiguation: false };
}

/**
 * Pick which Wikipedia hosts to query, in preference order. For Chinese locale
 * hints we try zh.wikipedia.org first; if the entity isn't there we retry
 * against en.wikipedia.org so we don't drop a valid Western entity just
 * because the user's UI is set to Chinese.
 */
function hostsForLocale(locale?: string): string[] {
  if (typeof locale !== 'string') return [ENGLISH_HOST];
  const normalized = locale.trim().toLowerCase();
  if (normalized.length === 0) return [ENGLISH_HOST];
  if (normalized === 'zh' || normalized.startsWith('zh-') || normalized.startsWith('zh_')) {
    return [CHINESE_HOST, ENGLISH_HOST];
  }
  return [ENGLISH_HOST];
}

async function fetchSummary(
  host: string,
  name: string,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<FetchOutcome> {
  const url = `https://${host}${REST_PATH}${encodeURIComponent(name)}`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      },
      signal: controller.signal
    });
  } catch {
    clearTimeout(timeoutHandle);
    return { kind: 'error' };
  }
  clearTimeout(timeoutHandle);

  if (response.status === 404) return { kind: 'notFound' };
  if (response.status >= 500 && response.status < 600) return { kind: 'error' };
  if (response.status !== 200) return { kind: 'error' };

  try {
    const data = (await response.json()) as RawSummary;
    return { kind: 'ok', data };
  } catch {
    return { kind: 'error' };
  }
}

export async function checkEntity(
  name: string,
  options: WikipediaOptions = {}
): Promise<EntityCheck> {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) {
    return { name: '', exists: false, isDisambiguation: false };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const hosts = hostsForLocale(options.locale);

  // Try each host in order. A 404 on the preferred host falls through to the
  // fallback; any other error (network, timeout, non-200/404) also falls
  // through so Chinese Wikipedia flakiness doesn't lose us the English hit.
  let lastOutcome: FetchOutcome = { kind: 'notFound' };
  for (const host of hosts) {
    const outcome = await fetchSummary(host, trimmed, fetchFn, timeoutMs);
    lastOutcome = outcome;
    if (outcome.kind === 'ok') break;
  }

  if (lastOutcome.kind !== 'ok') return notFound(trimmed);

  const data = lastOutcome.data;
  const pageUrl =
    data && data.content_urls && data.content_urls.desktop && typeof data.content_urls.desktop.page === 'string'
      ? data.content_urls.desktop.page
      : undefined;

  if (data && data.type === 'disambiguation') {
    const result: EntityCheck = {
      name: trimmed,
      exists: true,
      isDisambiguation: true
    };
    if (pageUrl !== undefined) {
      result.pageUrl = pageUrl;
    }
    return result;
  }

  const result: EntityCheck = {
    name: trimmed,
    exists: true,
    isDisambiguation: false
  };
  if (typeof data.extract === 'string') {
    result.extract = data.extract;
  }
  if (pageUrl !== undefined) {
    result.pageUrl = pageUrl;
  }
  return result;
}

export async function checkEntities(
  names: string[],
  options: WikipediaOptions = {}
): Promise<EntityCheck[]> {
  if (!Array.isArray(names) || names.length === 0) {
    return [];
  }

  // Trim + case-insensitive dedupe; preserve first-occurrence casing.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of names) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(trimmed);
    if (deduped.length >= MAX_ENTITIES) break;
  }

  if (deduped.length === 0) {
    return [];
  }

  return Promise.all(deduped.map((n) => checkEntity(n, options)));
}
