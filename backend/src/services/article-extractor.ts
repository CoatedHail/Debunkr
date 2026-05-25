import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { ApiError } from '../types/api.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const USER_AGENT =
  'Mozilla/5.0 (compatible; CredibilityCheckBot/0.1; +https://example.invalid/bot)';

export interface ExtractedArticle {
  title: string;
  byline?: string;
  siteName?: string;
  text: string;
}

export type ExtractResult =
  | { ok: true; article: ExtractedArticle }
  | { ok: false; error: ApiError['error'] };

export interface ExtractOptions {
  fetchImpl?: (url: string | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

export async function extractArticle(
  url: string,
  opts: ExtractOptions = {}
): Promise<ExtractResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }
    });
  } catch (e) {
    clearTimeout(timer);
    return {
      ok: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message: 'Failed to fetch the article.',
        retryable: true
      }
    };
  }
  clearTimeout(timer);

  if (!res.ok) {
    return {
      ok: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message: `Site returned HTTP ${res.status}.`,
        retryable: false
      }
    };
  }

  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_CONTENT_TYPE',
        message: `Only HTML pages are supported (got ${contentType || 'unknown'}).`,
        retryable: false
      }
    };
  }

  let html: string;
  try {
    html = await readBounded(res, MAX_BODY_BYTES);
  } catch {
    return {
      ok: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message: 'Article body exceeded size limit.',
        retryable: false
      }
    };
  }

  let parsed: ReturnType<Readability['parse']>;
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    parsed = reader.parse();
  } catch {
    return {
      ok: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message: 'Could not parse the page.',
        retryable: false
      }
    };
  }

  if (!parsed || !parsed.textContent || parsed.textContent.length < 100) {
    return {
      ok: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message: 'Could not find article content on the page.',
        retryable: false
      }
    };
  }

  return {
    ok: true,
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
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error('over size');
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  return new TextDecoder('utf-8').decode(buf);
}
