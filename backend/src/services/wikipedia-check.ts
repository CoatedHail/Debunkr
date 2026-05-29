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
};

const ENDPOINT_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
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

function notFound(name: string): EntityCheck {
  return { name, exists: false, isDisambiguation: false };
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

  const url = `${ENDPOINT_BASE}${encodeURIComponent(trimmed)}`;

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
    // Includes AbortError (timeout) and other network/fetch errors.
    clearTimeout(timeoutHandle);
    return notFound(trimmed);
  }
  clearTimeout(timeoutHandle);

  if (response.status === 404) {
    return notFound(trimmed);
  }
  if (response.status >= 500 && response.status < 600) {
    return notFound(trimmed);
  }
  if (response.status !== 200) {
    return notFound(trimmed);
  }

  let data: RawSummary;
  try {
    data = (await response.json()) as RawSummary;
  } catch {
    return notFound(trimmed);
  }

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
