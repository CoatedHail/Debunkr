import { getBraveSearchApiKey } from '../config/env.js';
import { canonicalDomain } from './canonical-domain.js';
import { isTier1 } from './tier1-sources.js';

export type SearchHit = {
  url: string;
  domain: string; // canonicalized
  title: string;
  snippet: string;
  publishedDate?: string;
  isTier1: boolean;
};

export type SearchWebOptions = {
  fetchFn?: typeof fetch;
  apiKey?: string;
  timeoutMs?: number; // default 5000
  count?: number; // default 10
};

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_COUNT = 10;
const SNIPPET_MAX_LEN = 300;

type RawBraveResult = {
  url?: string;
  title?: string;
  description?: string;
  page_age?: string;
  age?: string;
};

type RawBraveResponse = {
  web?: {
    results?: RawBraveResult[];
  };
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function pickPublishedDate(r: RawBraveResult): string | undefined {
  // Prefer `page_age` (Brave's documented ISO-ish field). Fall back to `age`
  // if it looks ISO-shaped (starts with 4-digit year). Otherwise omit.
  if (typeof r.page_age === 'string' && r.page_age.length > 0) {
    return r.page_age;
  }
  if (typeof r.age === 'string' && /^\d{4}/.test(r.age)) {
    return r.age;
  }
  return undefined;
}

function mapResult(r: RawBraveResult): SearchHit | null {
  if (typeof r.url !== 'string' || r.url.length === 0) return null;
  const domain = canonicalDomain(r.url);
  if (!domain) return null;

  const rawSnippet = typeof r.description === 'string' ? r.description : '';
  const snippet = stripHtml(rawSnippet).slice(0, SNIPPET_MAX_LEN);

  const hit: SearchHit = {
    url: r.url,
    domain,
    title: typeof r.title === 'string' ? r.title : '',
    snippet,
    isTier1: isTier1(domain)
  };
  const publishedDate = pickPublishedDate(r);
  if (publishedDate !== undefined) {
    hit.publishedDate = publishedDate;
  }
  return hit;
}

export async function searchWeb(
  query: string,
  options: SearchWebOptions = {}
): Promise<SearchHit[]> {
  const apiKey = options.apiKey ?? getBraveSearchApiKey();
  if (!apiKey) {
    return [];
  }

  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const count = options.count ?? DEFAULT_COUNT;

  const url =
    `${ENDPOINT}?q=${encodeURIComponent(query)}` +
    `&count=${count}&safesearch=moderate`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey
      },
      signal: controller.signal
    });
  } catch {
    // Includes AbortError (timeout) and other network/fetch errors.
    clearTimeout(timeoutHandle);
    return [];
  }
  clearTimeout(timeoutHandle);

  // Brave returns 403 on quota exhaustion — degrade, don't throw.
  if (response.status !== 200) {
    return [];
  }

  let data: RawBraveResponse;
  try {
    data = (await response.json()) as RawBraveResponse;
  } catch {
    return [];
  }

  if (!data || !data.web || !Array.isArray(data.web.results)) {
    return [];
  }

  const hits: SearchHit[] = [];
  for (const r of data.web.results) {
    const hit = mapResult(r);
    if (hit) hits.push(hit);
    if (hits.length >= count) break;
  }
  return hits;
}
