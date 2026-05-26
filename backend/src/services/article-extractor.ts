import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { ApiError } from '../types/api.js';
import { assertUrlNotBlocked } from './ssrf-guard.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const USER_AGENT =
  'Mozilla/5.0 (compatible; CredibilityCheckBot/0.1; +https://example.invalid/bot)';
const MAX_REDIRECTS = 5;

export interface ExtractedArticle {
  title: string;
  byline?: string;
  siteName?: string;
  text: string;
}

export type ExtractResult =
  | { ok: true; article: ExtractedArticle; finalUrl: string }
  | { ok: false; error: ApiError['error'] };

export interface ExtractOptions {
  fetchImpl?: (url: string | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  skipSsrfCheck?: boolean; // tests can disable when using mocked fetch
}

async function fetchWithRedirects(
  initialUrl: string,
  opts: { fetchImpl: ExtractOptions['fetchImpl']; timeoutMs: number; skipSsrfCheck: boolean }
): Promise<{ ok: true; res: Response; finalUrl: string } | { ok: false; error: ApiError['error'] }> {
  let url = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!opts.skipSsrfCheck) {
      const ssrf = await assertUrlNotBlocked(url);
      if (!ssrf.ok) {
        return { ok: false, error: { code: 'URL_BLOCKED', message: ssrf.reason, retryable: false } };
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await opts.fetchImpl!(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }
      });
    } catch {
      clearTimeout(timer);
      return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Failed to fetch the article.', retryable: true } };
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) {
        return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Redirect missing Location header.', retryable: false } };
      }
      url = new URL(next, url).toString();
      continue;
    }
    return { ok: true, res, finalUrl: url };
  }
  return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Too many redirects.', retryable: false } };
}

export async function extractArticle(
  url: string,
  opts: ExtractOptions = {}
): Promise<ExtractResult> {
  const fetchImpl = opts.fetchImpl ?? (fetch as ExtractOptions['fetchImpl']);
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const skipSsrfCheck = opts.skipSsrfCheck ?? false;

  const fetched = await fetchWithRedirects(url, { fetchImpl, timeoutMs, skipSsrfCheck });
  if (!fetched.ok) return fetched;
  const { res, finalUrl } = fetched;

  if (!res.ok) {
    return {
      ok: false,
      error: { code: 'EXTRACTION_FAILED', message: `Site returned HTTP ${res.status}.`, retryable: false }
    };
  }

  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return {
      ok: false,
      error: { code: 'UNSUPPORTED_CONTENT_TYPE', message: `Only HTML pages are supported (got ${contentType || 'unknown'}).`, retryable: false }
    };
  }

  let html: string;
  try { html = await readBounded(res, MAX_BODY_BYTES); }
  catch {
    return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Article body exceeded size limit.', retryable: false } };
  }

  let parsed: ReturnType<Readability['parse']>;
  try {
    const dom = new JSDOM(html, { url: finalUrl });
    parsed = new Readability(dom.window.document).parse();
  } catch {
    return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Could not parse the page.', retryable: false } };
  }

  if (!parsed || !parsed.textContent || parsed.textContent.length < 100) {
    return { ok: false, error: { code: 'EXTRACTION_FAILED', message: 'Could not find article content on the page.', retryable: false } };
  }

  return {
    ok: true,
    finalUrl,
    article: {
      title: parsed.title ?? '(untitled)',
      byline: parsed.byline ?? undefined,
      siteName: parsed.siteName ?? undefined,
      text: parsed.textContent.trim()
    }
  };
}

async function readBounded(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    const t = await res.text();
    if (t.length > maxBytes) throw new Error('over size');
    return t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch {} throw new Error('over size'); }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  return new TextDecoder('utf-8').decode(buf);
}
